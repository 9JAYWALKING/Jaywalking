import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STOPS, haversine, decodePolyline, cumulativeMeters, closestRoutePoint, upcomingWaypointIndex, extractValhallaTrip, formatDistance } from '../nav-utils.js';

test('initial coordinates and in-order waypoints exist', () => {
  assert.equal(DEFAULT_STOPS.length, 4);
  assert.match(DEFAULT_STOPS.at(-1).name, /후문/);
});
test('polyline6 decoder', () => {
  // Encoded by official Google polyline algorithm at precision 6.
  assert.deepEqual(decodePolyline('??_c`|@_c`|@'), [{lat:0,lon:0},{lat:1,lon:1}]);
});
test('haversine and projected along route', () => {
  assert.ok(haversine({lat:0,lon:0},{lat:0,lon:0.001}) > 100);
  const route=[{lat:37,lon:126},{lat:37,lon:126.01},{lat:37.01,lon:126.01}];
  const cumulative=cumulativeMeters(route);
  const p=closestRoutePoint({lat:37.0001,lon:126.005},route,cumulative);
  assert.ok(p.distance>5&&p.distance<30);
  assert.ok(p.along>300&&p.along<650);
});
test('route JSON response leg extraction', () => {
  const data={trip:{legs:[{shape:'??_c`|@_c`|@',maneuvers:[{type:1,begin_shape_index:0},{type:4,begin_shape_index:1}]}],summary:{length:100}}};
  const parsed=extractValhallaTrip(data);
  assert.equal(parsed.points.length,2);
  assert.equal(parsed.maneuvers.length,2);
});
test('chooses a remaining stop and formats units',()=>{
  assert.equal(upcomingWaypointIndex(DEFAULT_STOPS[0],DEFAULT_STOPS),1);
  assert.equal(formatDistance(1050),'1.05 km');
});
