import { DEFAULT_STOPS, haversine, closestRoutePoint, extractValhallaTrip, formatDistance, upcomingWaypointIndex, turnSymbol, koreanManeuver } from './nav-utils.js';

const API = 'https://valhalla1.openstreetmap.de/route';
const SAVE_KEY = 'straightwalk-stops-v1';
const $ = id => document.getElementById(id);
const els = {
  distance: $('distance'), eta: $('eta'), accuracy: $('accuracy'), notice: $('notice'),
  gps: $('gpsBtn'), reroute: $('rerouteBtn'), route: $('routeBtn'),
  turnIcon: $('turnIcon'), turnText: $('turnText'), turnCaption: $('turnCaption'), turnSub: $('turnSub'),
  mapChip: $('mapChip'), center: $('centerBtn'), full: $('fullBtn'), list: $('waypointList'), reset: $('resetBtn')
};
let stops = loadStops();
let gpsFix = null, watchId = null, gpsLayer = null, accuracyLayer = null;
let routeLayer = null, guideLayer = null, activeRoute = null, isRouting = false, map;
let pins = [], snapProgress = 0;
let routeRequestCounter = 0;

function loadStops() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (Array.isArray(parsed) && parsed.length === DEFAULT_STOPS.length && parsed.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat > 37.3 && p.lat < 37.6 && p.lon > 126.4 && p.lon < 126.9))
      return DEFAULT_STOPS.map((p, i) => ({ ...p, lat: parsed[i].lat, lon: parsed[i].lon }));
  } catch {} // Non-blocking: storage can be denied in private mode.
  return DEFAULT_STOPS.map(p => ({ ...p }));
}
function persistStops() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(stops.map(p => ({lat:p.lat,lon:p.lon})))); } catch {} }
function setNotice(text, kind = '') { els.notice.textContent = text; els.notice.className = `alert ${kind}`; }
function setInfo(title, subtitle, label='다음 안내', icon='↑') {
  els.turnText.textContent = title; els.turnSub.textContent = subtitle;
  els.turnCaption.textContent = label; els.turnIcon.textContent = icon;
}
function defaultMap() {
  map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([37.4587,126.6428],13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  createPins();
  showGuide();
  fitAll();
}
function fitAll() {
  const coords = [...stops.map(p => [p.lat, p.lon])];
  if (gpsFix) coords.push([gpsFix.lat, gpsFix.lon]);
  map.fitBounds(L.latLngBounds(coords).pad(0.17), {maxZoom:15, animate:true});
}
function showGuide() {
  if (guideLayer) map.removeLayer(guideLayer);
  if (activeRoute) return;
  guideLayer = L.polyline(stops.map(p => [p.lat,p.lon]), {color:'#d0ab65',weight:3,opacity:.8,dashArray:'4 10'}).addTo(map);
  els.mapChip.textContent='점선은 경유지 참고선 · 보행 경로 아님';
}
function waypointIcon(index) {
  const cls = index === 0 ? '' : index === stops.length-1 ? 'dest' : 'middle';
  return L.divIcon({className:'',html:`<div class="pin ${cls}">${index===stops.length-1?'✓':index+1}</div>`,iconSize:[28,28],iconAnchor:[14,14]});
}
function createPins() {
  for (const pin of pins) map.removeLayer(pin);
  pins = stops.map((point,i) => {
    const marker = L.marker([point.lat,point.lon], {icon:waypointIcon(i),draggable:true,autoPan:true}).addTo(map);
    marker.bindTooltip(point.name, {direction:'top',offset:[0,-15]});
    marker.on('dragend', async e => {
      const p = e.target.getLatLng(); stops[i].lat=p.lat; stops[i].lon=p.lng;
      persistStops(); renderStops(); clearRoute(); showGuide();
      setNotice(`${stops[i].name}의 위치를 조정했습니다. 보행 경로를 다시 계산합니다.`);
      await requestRoute();
    });
    return marker;
  });
  renderStops();
}
function renderStops() {
  els.list.replaceChildren();
  stops.forEach((point,i) => {
    const li=document.createElement('li');
    const num=document.createElement('span');num.className='num';num.textContent=i+1;
    const desc=document.createElement('div');desc.className='desc';
    const name=document.createElement('strong');name.textContent=point.name;
    const small=document.createElement('small');small.textContent=point.description;
    desc.append(name,small);
    const zoom=document.createElement('button');zoom.type='button';zoom.textContent='지도 보기';
    zoom.addEventListener('click',()=>{map.setView([point.lat,point.lon],17);pins[i].openTooltip();});
    li.append(num,desc,zoom);els.list.appendChild(li);
  });
}
function clearRoute() {
  activeRoute = null; snapProgress = 0;
  if (routeLayer) map.removeLayer(routeLayer); routeLayer=null;
  els.distance.textContent='—';els.eta.textContent='—';
}
function routeLocations(useCurrent) {
  if (useCurrent && gpsFix) {
    const next = upcomingWaypointIndex(gpsFix, stops);
    return [gpsFix, ...stops.slice(next)];
  }
  return stops;
}
async function requestRoute(useCurrent = false) {
  if (isRouting) return;
  isRouting = true;
  const thisRequest = ++routeRequestCounter;
  els.route.disabled=true; els.reroute.disabled=true;
  setNotice('보행자 통행이 허용된 도로를 따라 경로를 계산하고 있습니다.');
  els.mapChip.textContent='보행 경로 계산 중…';
  const locations=routeLocations(useCurrent);
  const payload={ locations:locations.map((p,i)=>({lat:p.lat,lon:p.lon,type: i===0||i===locations.length-1?'break':'through'})),
    costing:'pedestrian', units:'kilometers', language:'en-US', shape_format:'polyline6', directions_type:'instructions'};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),17000);
    let response;
    try {
      // GET avoids JSON POST preflight on deployments whose routing host disallows OPTIONS.
      const url = `${API}?json=${encodeURIComponent(JSON.stringify(payload))}`;
      try {
        response = await fetch(url, {signal:controller.signal,headers:{'X-Client-Id':'straightwalk-github-pages'}});
      } catch (headerError) {
        // Some public CORS proxies do not allow custom request headers.
        // Fall back to a simple GET request rather than failing the navigation.
        if (headerError.name === 'AbortError') throw headerError;
        response = await fetch(url, {signal:controller.signal});
      }
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(response.status===429 ? '공개 경로 서버가 요청을 제한했습니다(429)' : `경로 서버 오류(${response.status})`);
    const data=await response.json();
    const result=extractValhallaTrip(data);
    if (thisRequest!==routeRequestCounter) return;
    clearRoute();
    activeRoute=result;
    if (guideLayer){map.removeLayer(guideLayer);guideLayer=null;}
    routeLayer=L.polyline(result.points.map(p=>[p.lat,p.lon]), {color:'#25bb88',weight:7,opacity:.92,lineCap:'round',lineJoin:'round'}).addTo(map);
    routeLayer.bringToFront();
    map.fitBounds(routeLayer.getBounds().pad(0.1),{maxZoom:16});
    const routeLen=result.cumulative.at(-1);
    els.mapChip.textContent='실제 보행 네트워크 기반 경로';
    els.distance.textContent=formatDistance(routeLen);
    els.eta.textContent=`${Math.max(1,Math.round(routeLen/75))}분`;
    setNotice('보행 경로를 불러왔습니다. 경유지 직진 우선 설정이며 횡단보도 최소화는 검증되지 않았습니다.','success');
    setInfo('도보 경로 준비 완료','GPS 시작을 누르면 내 위치에 맞춘 다음 진행 방향을 표시합니다.','안내 준비','↑');
    if(gpsFix) updateNavigation();
  } catch(error) {
    if (thisRequest!==routeRequestCounter) return;
    clearRoute();showGuide();
    setNotice(`도보 경로를 가져오지 못했습니다: ${error.message}. 점선은 도보 길이 아닌 경유지 연결 참고선입니다. 인터넷 연결·경유지 위치를 확인하세요.`,'error');
    setInfo('도보 경로를 계산할 수 없습니다','안전한 보행로를 확인하지 못했으므로 직선 점선을 따라가지 마세요.','경로 없음','!');
  } finally {
    isRouting=false; els.route.disabled=false; els.reroute.disabled=!gpsFix;
  }
}
function startOrStopGps() {
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;els.gps.textContent='◉ GPS 시작';setNotice('GPS 추적이 중지되었습니다.');return;}
  if(!window.isSecureContext){setNotice('GPS는 HTTPS 페이지에서만 작동합니다. GitHub Pages 주소(https://)로 접속하세요.','error');return;}
  if(!navigator.geolocation){setNotice('이 브라우저는 GPS 기능을 지원하지 않습니다.','error');return;}
  els.gps.textContent='GPS 연결 중…';
  watchId=navigator.geolocation.watchPosition(
    position => {
      const c=position.coords;
      gpsFix={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,heading:c.heading};
      const coords=[gpsFix.lat,gpsFix.lon];
      if(!gpsLayer){
        gpsLayer=L.marker(coords,{icon:L.divIcon({className:'',html:'<div class="current-dot"></div>',iconSize:[17,17],iconAnchor:[8,8]}),zIndexOffset:1000}).addTo(map);
        map.setView(coords,16);
      } else gpsLayer.setLatLng(coords);
      if(!accuracyLayer)accuracyLayer=L.circle(coords,{radius:c.accuracy,color:'#2c80f5',weight:1,fillOpacity:.08,interactive:false}).addTo(map);
      else accuracyLayer.setLatLng(coords).setRadius(c.accuracy);
      els.accuracy.textContent=`±${Math.round(c.accuracy)} m`;
      els.gps.textContent='■ GPS 중지';els.reroute.disabled=isRouting;
      updateNavigation();
    },
    error => {
      els.gps.textContent=watchId===null?'◉ GPS 시작':'■ GPS 중지';
      const messages={1:'위치 권한이 거부되었습니다. iOS 설정 또는 주소창의 위치 권한을 허용하세요.',2:'현재 GPS 위치를 얻을 수 없습니다.',3:'GPS 요청이 지연되고 있습니다. 야외에서 다시 시도하세요.'};
      setNotice(messages[error.code] || error.message,'error');
      if(error.code===1 && watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;els.gps.textContent='◉ GPS 시작';}
    },
    {enableHighAccuracy:true,maximumAge:2500,timeout:17000}
  );
}
function updateNavigation() {
  if(!gpsFix) return;
  if(!activeRoute){
    setInfo('GPS 연결됨 · 보행 경로 필요','정확한 길안내는 경로 계산이 완료되면 시작됩니다.','현재 위치 확인','◎');
    return;
  }
  const progress=closestRoutePoint(gpsFix,activeRoute.points,activeRoute.cumulative);
  if(!progress) return;
  const allowedDeviation=Math.max(35, Math.min(gpsFix.accuracy*1.3,80));
  if(progress.distance>allowedDeviation){
    setNotice(`현재 위치가 경로에서 약 ${Math.round(progress.distance)}m 벗어났습니다. 안전한 곳에서 '내 위치에서 재탐색'을 누르세요.`,'warning');
    setInfo('경로 이탈 가능성','내 위치에서 재탐색하거나 지도의 길을 확인하세요.','GPS 경로 이탈','↻');
    return;
  }
  // GPS jitter suppression: do not move backwards more than 15m once progress established.
  snapProgress=Math.max(snapProgress-15,progress.along);
  const total=activeRoute.cumulative.at(-1);
  const remain=Math.max(0,total-snapProgress);
  els.distance.textContent=formatDistance(remain);
  els.eta.textContent=remain<50?'도착':`${Math.max(1,Math.round(remain/75))}분`;
  if(remain<35 && haversine(gpsFix,stops.at(-1))<65){
    setInfo('목적지 부근에 도착했어요','실제 인하대 후문 위치를 확인하세요.','도착 근처','✓');
    return;
  }
  // Valhalla instructions are currently English. Display their concise original text.
  const next=activeRoute.maneuvers.find(m=>activeRoute.cumulative[Math.min(m.globalIndex,activeRoute.cumulative.length-1)]>snapProgress+7 && m.type!==4);
  if(next){
    const d=Math.max(0,activeRoute.cumulative[Math.min(next.globalIndex,activeRoute.cumulative.length-1)]-snapProgress);
    setInfo(koreanManeuver(next),`${formatDistance(d)} 뒤 안내 · 주변 횡단보도와 신호를 우선하세요.`,'다음 진행 방향',turnSymbol(next.type));
  } else setInfo('목적지 방향으로 계속 이동','지도에 표시된 도보 경로를 따라 이동하세요.','남은 구간','↑');
}

els.gps.addEventListener('click',startOrStopGps);
els.route.addEventListener('click',()=>requestRoute(false));
els.reroute.addEventListener('click',()=>{if(gpsFix)requestRoute(true);});
els.center.addEventListener('click',()=>{if(gpsFix) map.setView([gpsFix.lat,gpsFix.lon],17);else setNotice('GPS 시작을 누르면 내 위치를 지도로 이동할 수 있습니다.');});
els.full.addEventListener('click',fitAll);
els.reset.addEventListener('click',async()=>{
  stops=DEFAULT_STOPS.map(p=>({...p}));persistStops();clearRoute();createPins();showGuide();fitAll();await requestRoute();
});
window.addEventListener('pagehide',()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId);});
try {defaultMap();requestRoute();} catch(e){setNotice(`지도를 시작하지 못했습니다: ${e.message}. 네트워크 연결을 확인하세요.`,'error');}
