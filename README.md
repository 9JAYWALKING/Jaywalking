# 직진길 — 신포역 → 인하대 후문 GPS 도보 길찾기

**GitHub Pages에 바로 올릴 수 있는 정적 웹앱**입니다. Node.js 서버, DB, API 키, 빌드 작업이 필요하지 않습니다.

## 제공 기능

- OpenStreetMap + Leaflet 기반 모바일 지도
- 신포역 → 숭의로터리 → 용현고가교 인근 → 인하대 후문 인근 경유
- Valhalla **pedestrian** API로 도로/보행로 기반 도보 경로를 요청
- 스마트폰 GPS 연결 (`navigator.geolocation.watchPosition`), GPS 정확도 표시
- 도보 경로상 남은 거리/예상 시간, 다음 안내 지점 표시
- 경로 이탈 감지 및 사용자 버튼을 통한 현재 위치 기준 재탐색
- 지도 위 핀을 끌어 경유지 수정 → 경로 재탐색, 수정한 좌표는 같은 기기에만 저장
- 사용자가 명시적으로 재탐색을 누르기 전까지 GPS 좌표를 경로 서버로 보내지 않음 (지도 API 등 외부 요청은 별도)

## GitHub Pages 배포 (약 2분 과정)

1. GitHub에 새 **Public** repository를 만듭니다. 예: `sinpo-inha-walk`.
2. 이 ZIP을 풀고 **폴더 안에 있는 파일들을 저장소 최상위**에 업로드합니다. `index.html`이 저장소 루트에 있어야 합니다.
3. 저장소 **Settings → Pages → Build and deployment**에서 `Deploy from a branch` → `main` → `/(root)` → `Save`.
4. 배포되면 `https://<github-id>.github.io/<repo-name>/` 주소에서 엽니다.
5. iPhone Safari에서 링크를 열고 **GPS 시작**을 누른 뒤 위치 권한을 허용합니다. 필요하면 공유 → 홈 화면에 추가로 홈 화면 아이콘을 만드세요.

## 로컬 실행 / 테스트

```bash
python3 -m http.server 8080
# http://localhost:8080
```

`node --test`로 순수 경로/좌표 함수 테스트가 가능합니다. **파일을 더블클릭해서 `file://`로 여는 방식은 ES module/CORS 때문에 지원하지 않습니다.**

## 중요한 한계

1. **경로의 지점 좌표는 이전 대화에서 사용한 잠정 좌표**입니다. 특히 `인하대 후문 인근`은 정확한 출입구 좌표로 현장 검증한 것이 아닙니다. 위치가 부정확하다면 지도의 핀을 끌어 조정하세요.
2. 이 앱은 **횡단보도 최소 개수를 증명하지 않습니다.** 직진·횡단보도 선호는 경유지로 방향을 유도하는 정도입니다. 실제 보행자 경로는 Valhalla가 보행 네트워크에서 산출하며, 그 결과를 사용자가 확인해야 합니다.
3. Valhalla FOSSGIS 공개 데모는 **공정 이용·요청 제한**이 있습니다. 다수 사용자/상용 배포에는 본인 서버나 계약된 API로 바꾸세요. 운영자는 배포 전 Valhalla GitHub Discussions에서 앱을 알리고 `X-Client-Id`를 운영 서비스 식별자로 변경하는 것을 권장합니다. 공개 서비스의 응답 및 CORS 여부는 네트워크 환경에 따라 다를 수 있습니다.
4. API 오류 시 나오는 **갈색 점선은 지도를 따라가는 실제 길이 아닙니다.** 점선을 횡단 경로처럼 따라가지 마세요.
5. 방향 전환 안내는 경로 서버의 동작 유형을 바탕으로 한국어로 간략 표시합니다. 도로명은 영문으로 표시될 수 있습니다. 이것은 **음성 내비게이션이 아니며**, GPS를 화면에서 주기적으로 확인하는 간단한 도보 가이드입니다.
6. **웹앱은 iOS Safari의 백그라운드 GPS 지속 추적을 보장하지 않습니다.** 화면 잠금/앱 전환 상태에서는 위치 업데이트가 멈출 수 있으므로 걷는 동안 화면을 열어 두어야 합니다.
7. 외부 네트워크 의존: Leaflet CDN, OpenStreetMap 지도 타일, Valhalla API. GPS 측위는 브라우저/OS에 의존합니다.

## 개인정보

사이트 운영 서버와 사용자 계정/위치 데이터베이스는 없습니다. GPS 좌표는 기본적으로 기기 브라우저 내에서 표시됩니다. 사용자가 ‘내 위치에서 재탐색’을 누르면 그 순간 GPS 좌표가 **Valhalla 공개 경로 서버**로 전송됩니다. 지도 타일 서버에는 지도를 열 때 요청 정보(IP 등)가 전달될 수 있습니다. GitHub Pages와 브라우저 자체 로그 정책은 별개입니다.

## 직접 수정하기

- **경유지/좌표**: `nav-utils.js`의 `DEFAULT_STOPS` 변경
- **API 주소**: `app.js`의 `API` 변경
- **배색·화면 크기**: `style.css` 변경

출처 및 참고:
- Valhalla route API: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
- Valhalla public demo: https://valhalla.openstreetmap.de/
- OSM copyright: https://www.openstreetmap.org/copyright
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 라이선스

이 앱의 코드: MIT. 기반 지도 데이터/라이브러리는 각 프로젝트 라이선스/저작권에 따릅니다.
