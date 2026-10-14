/** Pure helpers: importable in browser and testable with Node.js. */
export const DEFAULT_STOPS = Object.freeze([
  { name: '신포역', description: '출발지 · 역 출입구 위치는 지도에서 확인', lat: 37.46878, lon: 126.62397 },
  { name: '숭의로터리', description: '첫 번째 직진 경유 기준점 · 드래그 가능', lat: 37.4625667, lon: 126.6410333 },
  { name: '용현고가교 인근', description: '두 번째 직진 경유 기준점 · 드래그 가능', lat: 37.4519833, lon: 126.65035 },
  { name: '인하대 후문 인근', description: '도착 기준점 · 실제 후문 위치 확인 후 조정', lat: 37.45169, lon: 126.65464 }
]);

export function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function decodePolyline(encoded, precision = 6) {
  let i = 0, lat = 0, lon = 0;
  const out = [], factor = 10 ** precision;
  while (i < encoded.length) {
    const vals = [];
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0, result = 0, b;
      do {
        if (i >= encoded.length) throw new Error('손상된 경로 데이터');
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
        if (shift > 40) throw new Error('손상된 경로 데이터');
      } while (b >= 0x20);
      vals.push((result & 1) ? ~(result >> 1) : (result >> 1));
    }
    lat += vals[0]; lon += vals[1];
    out.push({ lat: lat / factor, lon: lon / factor });
  }
  return out;
}
export function cumulativeMeters(path) {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversine(path[i - 1], path[i]));
  return out;
}
// Project a GPS fix onto each route segment, in locally scaled metres.
export function closestRoutePoint(location, path, cumulative = cumulativeMeters(path)) {
  if (!path.length) return null;
  if (path.length === 1) return { distance: haversine(location, path[0]), along: 0, segmentIndex: 0 };
  const longitudeScale = 111320 * Math.cos(location.lat * Math.PI / 180), latitudeScale = 111195;
  let best = null;
  for (let i = 0; i + 1 < path.length; i++) {
    const ax = (path[i].lon - location.lon) * longitudeScale, ay = (path[i].lat - location.lat) * latitudeScale;
    const bx = (path[i + 1].lon - location.lon) * longitudeScale, by = (path[i + 1].lat - location.lat) * latitudeScale;
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / Math.max(vx * vx + vy * vy, 0.00001)));
    const dist = Math.hypot(ax + t * vx, ay + t * vy);
    const along = cumulative[i] + t * (cumulative[i + 1] - cumulative[i]);
    if (!best || dist < best.distance) best = { distance: dist, along, segmentIndex: i };
  }
  return best;
}
export function extractValhallaTrip(data) {
  if (!data?.trip?.legs?.length) throw new Error(data?.error || '경로 응답을 해석하지 못했습니다');
  let points = [], maneuvers = [];
  for (const leg of data.trip.legs) {
    if (typeof leg.shape !== 'string') throw new Error('보행자용 지도 경로가 없습니다');
    const local = decodePolyline(leg.shape);
    if (local.length < 2) throw new Error('경로의 좌표가 부족합니다');
    const offset = points.length ? points.length - 1 : 0;
    for (const m of leg.maneuvers || []) maneuvers.push({ ...m, globalIndex: offset + (m.begin_shape_index || 0) });
    if (points.length && haversine(points.at(-1), local[0]) < 2) points.push(...local.slice(1));
    else points.push(...local);
  }
  return { points, maneuvers, cumulative: cumulativeMeters(points), summary: data.trip.summary };
}
export function formatDistance(m) { return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(m))} m`; }
export function upcomingWaypointIndex(position, stops) {
  // Closest progress on the rough corridor, then preserve all downstream waypoints.
  const route = closestRoutePoint(position, stops);
  if (!route) return 1;
  return Math.min(stops.length - 1, route.segmentIndex + 1);
}
export function turnSymbol(type) {
  if ([12,13].includes(type)) return '↩';
  if ([2,9,10,11,18,20,23,37].includes(type)) return '↱';
  if ([3,14,15,16,19,21,24,38].includes(type)) return '↰';
  if ([4,5,6].includes(type)) return '✓';
  return '↑';
}
export function koreanManeuver(m) {
  const road = Array.isArray(m.street_names) && m.street_names.length ? ` · ${m.street_names[0]}` : '';
  const t = m.type;
  if ([4,5,6].includes(t)) return '목적지에 도착합니다';
  if ([12,13].includes(t)) return `유턴하세요${road}`;
  if ([11,14].includes(t)) return `${t===11?'급우회전':'급좌회전'}하세요${road}`;
  if ([10,15].includes(t)) return `${t===10?'우회전':'좌회전'}하세요${road}`;
  if ([2,9,18,20,23,37].includes(t)) return `오른쪽 방향으로 이동하세요${road}`;
  if ([3,16,19,21,24,38].includes(t)) return `왼쪽 방향으로 이동하세요${road}`;
  if (t===26) return '로터리에 진입하세요';
  if (t===27) return '로터리에서 나가세요';
  if (t===39) return '엘리베이터를 이용하세요';
  if (t===40) return '계단을 이용하세요';
  return `직진 또는 경로를 따라 계속 이동하세요${road}`;
}
