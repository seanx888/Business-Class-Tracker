// Airport reference data shared by the scanner and the PWA.
// code: [city EN, city 中文, city 한국어, ISO country, lat, lon, region]
// Regions: TW JP KR SEA SAS ME EU NA OC LATAM AF CAS CN

const P = (en, zh, ko, country, lat, lon, region) => ({ en, zh, ko, country, lat, lon, region });

export const AIRPORTS = {
  // Taiwan
  TPE: P('Taipei Taoyuan', '台北桃園', '타이베이(타오위안)', 'TW', 25.08, 121.23, 'TW'),
  TSA: P('Taipei Songshan', '台北松山', '타이베이(쑹산)', 'TW', 25.07, 121.55, 'TW'),
  KHH: P('Kaohsiung', '高雄', '가오슝', 'TW', 22.58, 120.35, 'TW'),
  RMQ: P('Taichung', '台中', '타이중', 'TW', 24.26, 120.62, 'TW'),
  TNN: P('Tainan', '台南', '타이난', 'TW', 22.95, 120.21, 'TW'),
  HUN: P('Hualien', '花蓮', '화롄', 'TW', 24.02, 121.62, 'TW'),
  TTT: P('Taitung', '台東', '타이둥', 'TW', 22.76, 121.1, 'TW'),
  MZG: P('Penghu', '澎湖', '펑후', 'TW', 23.57, 119.63, 'TW'),
  KNH: P('Kinmen', '金門', '진먼', 'TW', 24.43, 118.36, 'TW'),
  // Japan
  NRT: P('Tokyo Narita', '東京成田', '도쿄(나리타)', 'JP', 35.77, 140.39, 'JP'),
  HND: P('Tokyo Haneda', '東京羽田', '도쿄(하네다)', 'JP', 35.55, 139.78, 'JP'),
  KIX: P('Osaka Kansai', '大阪關西', '오사카(간사이)', 'JP', 34.43, 135.24, 'JP'),
  ITM: P('Osaka Itami', '大阪伊丹', '오사카(이타미)', 'JP', 34.79, 135.44, 'JP'),
  NGO: P('Nagoya', '名古屋', '나고야', 'JP', 34.86, 136.81, 'JP'),
  FUK: P('Fukuoka', '福岡', '후쿠오카', 'JP', 33.59, 130.45, 'JP'),
  CTS: P('Sapporo', '札幌', '삿포로', 'JP', 42.78, 141.69, 'JP'),
  OKA: P('Okinawa', '沖繩', '오키나와', 'JP', 26.2, 127.65, 'JP'),
  KOJ: P('Kagoshima', '鹿兒島', '가고시마', 'JP', 31.8, 130.72, 'JP'),
  SDJ: P('Sendai', '仙台', '센다이', 'JP', 38.14, 140.92, 'JP'),
  HIJ: P('Hiroshima', '廣島', '히로시마', 'JP', 34.44, 132.92, 'JP'),
  KMQ: P('Komatsu', '小松', '고마쓰', 'JP', 36.39, 136.41, 'JP'),
  OKJ: P('Okayama', '岡山', '오카야마', 'JP', 34.76, 133.86, 'JP'),
  KMJ: P('Kumamoto', '熊本', '구마모토', 'JP', 32.84, 130.86, 'JP'),
  HKD: P('Hakodate', '函館', '하코다테', 'JP', 41.77, 140.82, 'JP'),
  ISG: P('Ishigaki', '石垣島', '이시가키', 'JP', 24.34, 124.19, 'JP'),
  UKB: P('Kobe', '神戶', '고베', 'JP', 34.63, 135.22, 'JP'),
  // Korea
  ICN: P('Seoul Incheon', '首爾仁川', '서울(인천)', 'KR', 37.46, 126.44, 'KR'),
  GMP: P('Seoul Gimpo', '首爾金浦', '서울(김포)', 'KR', 37.56, 126.8, 'KR'),
  PUS: P('Busan', '釜山', '부산', 'KR', 35.18, 128.94, 'KR'),
  CJU: P('Jeju', '濟州', '제주', 'KR', 33.51, 126.49, 'KR'),
  TAE: P('Daegu', '大邱', '대구', 'KR', 35.9, 128.66, 'KR'),
  CJJ: P('Cheongju', '清州', '청주', 'KR', 36.72, 127.5, 'KR'),
  // Southeast Asia
  BKK: P('Bangkok', '曼谷', '방콕', 'TH', 13.69, 100.75, 'SEA'),
  DMK: P('Bangkok Don Mueang', '曼谷廊曼', '방콕(돈므앙)', 'TH', 13.91, 100.61, 'SEA'),
  HKT: P('Phuket', '普吉島', '푸껫', 'TH', 8.11, 98.32, 'SEA'),
  CNX: P('Chiang Mai', '清邁', '치앙마이', 'TH', 18.77, 98.96, 'SEA'),
  SGN: P('Ho Chi Minh City', '胡志明市', '호치민', 'VN', 10.82, 106.66, 'SEA'),
  HAN: P('Hanoi', '河內', '하노이', 'VN', 21.22, 105.81, 'SEA'),
  DAD: P('Da Nang', '峴港', '다낭', 'VN', 16.04, 108.2, 'SEA'),
  CXR: P('Nha Trang', '芽莊', '나트랑', 'VN', 12.0, 109.22, 'SEA'),
  PQC: P('Phu Quoc', '富國島', '푸꾸옥', 'VN', 10.17, 103.99, 'SEA'),
  MNL: P('Manila', '馬尼拉', '마닐라', 'PH', 14.51, 121.02, 'SEA'),
  CRK: P('Clark', '克拉克', '클라크', 'PH', 15.19, 120.56, 'SEA'),
  CEB: P('Cebu', '宿霧', '세부', 'PH', 10.31, 123.98, 'SEA'),
  KLO: P('Kalibo (Boracay)', '卡利波(長灘島)', '칼리보(보라카이)', 'PH', 11.68, 122.38, 'SEA'),
  DVO: P('Davao', '納卯', '다바오', 'PH', 7.13, 125.65, 'SEA'),
  PPS: P('Puerto Princesa', '公主港', '푸에르토프린세사', 'PH', 9.74, 118.76, 'SEA'),
  USM: P('Koh Samui', '蘇美島', '코사무이', 'TH', 9.55, 100.06, 'SEA'),
  KBV: P('Krabi', '喀比', '크라비', 'TH', 8.1, 98.99, 'SEA'),
  SIN: P('Singapore', '新加坡', '싱가포르', 'SG', 1.36, 103.99, 'SEA'),
  KUL: P('Kuala Lumpur', '吉隆坡', '쿠알라룸푸르', 'MY', 2.75, 101.71, 'SEA'),
  PEN: P('Penang', '檳城', '페낭', 'MY', 5.3, 100.28, 'SEA'),
  BKI: P('Kota Kinabalu', '亞庇', '코타키나발루', 'MY', 5.94, 116.05, 'SEA'),
  CGK: P('Jakarta', '雅加達', '자카르타', 'ID', -6.13, 106.66, 'SEA'),
  DPS: P('Bali', '峇里島', '발리', 'ID', -8.75, 115.17, 'SEA'),
  SUB: P('Surabaya', '泗水', '수라바야', 'ID', -7.38, 112.79, 'SEA'),
  PNH: P('Phnom Penh', '金邊', '프놈펜', 'KH', 11.55, 104.84, 'SEA'),
  KTI: P('Phnom Penh Techo', '金邊德崇', '프놈펜(테초)', 'KH', 11.35, 104.93, 'SEA'),
  SAI: P('Siem Reap', '暹粒', '씨엠립', 'KH', 13.37, 104.22, 'SEA'),
  RGN: P('Yangon', '仰光', '양곤', 'MM', 16.91, 96.13, 'SEA'),
  VTE: P('Vientiane', '永珍', '비엔티안', 'LA', 17.99, 102.56, 'SEA'),
  BWN: P('Bandar Seri Begawan', '汶萊', '반다르스리브가완', 'BN', 4.94, 114.93, 'SEA'),
  // Pacific islands
  ROR: P('Palau', '帛琉', '팔라우', 'PW', 7.37, 134.54, 'OC'),
  GUM: P('Guam', '關島', '괌', 'GU', 13.48, 144.8, 'OC'),
  SPN: P('Saipan', '塞班', '사이판', 'MP', 15.12, 145.73, 'OC'),
  // South Asia
  DEL: P('Delhi', '德里', '델리', 'IN', 28.56, 77.1, 'SAS'),
  BOM: P('Mumbai', '孟買', '뭄바이', 'IN', 19.09, 72.87, 'SAS'),
  BLR: P('Bengaluru', '班加羅爾', '벵갈루루', 'IN', 13.2, 77.71, 'SAS'),
  MAA: P('Chennai', '清奈', '첸나이', 'IN', 12.99, 80.17, 'SAS'),
  CMB: P('Colombo', '可倫坡', '콜롬보', 'LK', 7.18, 79.88, 'SAS'),
  MLE: P('Malé (Maldives)', '馬爾地夫', '몰디브', 'MV', 4.19, 73.53, 'SAS'),
  KTM: P('Kathmandu', '加德滿都', '카트만두', 'NP', 27.7, 85.36, 'SAS'),
  DAC: P('Dhaka', '達卡', '다카', 'BD', 23.84, 90.4, 'SAS'),
  // Middle East & Africa
  DXB: P('Dubai', '杜拜', '두바이', 'AE', 25.25, 55.36, 'ME'),
  AUH: P('Abu Dhabi', '阿布達比', '아부다비', 'AE', 24.43, 54.65, 'ME'),
  DOH: P('Doha', '杜哈', '도하', 'QA', 25.27, 51.61, 'ME'),
  IST: P('Istanbul', '伊斯坦堡', '이스탄불', 'TR', 41.28, 28.75, 'EU'),
  RUH: P('Riyadh', '利雅德', '리야드', 'SA', 24.96, 46.7, 'ME'),
  JED: P('Jeddah', '吉達', '제다', 'SA', 21.68, 39.16, 'ME'),
  TLV: P('Tel Aviv', '特拉維夫', '텔아비브', 'IL', 32.01, 34.89, 'ME'),
  AMM: P('Amman', '安曼', '암만', 'JO', 31.72, 35.99, 'ME'),
  MCT: P('Muscat', '馬斯喀特', '무스카트', 'OM', 23.59, 58.28, 'ME'),
  BAH: P('Bahrain', '巴林', '바레인', 'BH', 26.27, 50.63, 'ME'),
  KWI: P('Kuwait', '科威特', '쿠웨이트', 'KW', 29.24, 47.97, 'ME'),
  CAI: P('Cairo', '開羅', '카이로', 'EG', 30.12, 31.41, 'AF'),
  ADD: P('Addis Ababa', '阿迪斯阿貝巴', '아디스아바바', 'ET', 8.98, 38.8, 'AF'),
  NBO: P('Nairobi', '奈洛比', '나이로비', 'KE', -1.32, 36.93, 'AF'),
  JNB: P('Johannesburg', '約翰尼斯堡', '요하네스버그', 'ZA', -26.14, 28.24, 'AF'),
  CPT: P('Cape Town', '開普敦', '케이프타운', 'ZA', -33.97, 18.6, 'AF'),
  // Europe
  CDG: P('Paris', '巴黎', '파리', 'FR', 49.01, 2.55, 'EU'),
  ORY: P('Paris Orly', '巴黎奧利', '파리(오를리)', 'FR', 48.72, 2.38, 'EU'),
  AMS: P('Amsterdam', '阿姆斯特丹', '암스테르담', 'NL', 52.31, 4.76, 'EU'),
  LHR: P('London', '倫敦', '런던', 'GB', 51.47, -0.45, 'EU'),
  LGW: P('London Gatwick', '倫敦蓋威克', '런던(개트윅)', 'GB', 51.15, -0.19, 'EU'),
  MAN: P('Manchester', '曼徹斯特', '맨체스터', 'GB', 53.35, -2.27, 'EU'),
  EDI: P('Edinburgh', '愛丁堡', '에든버러', 'GB', 55.95, -3.37, 'EU'),
  DUB: P('Dublin', '都柏林', '더블린', 'IE', 53.42, -6.27, 'EU'),
  FRA: P('Frankfurt', '法蘭克福', '프랑크푸르트', 'DE', 50.04, 8.56, 'EU'),
  MUC: P('Munich', '慕尼黑', '뮌헨', 'DE', 48.35, 11.79, 'EU'),
  BER: P('Berlin', '柏林', '베를린', 'DE', 52.37, 13.5, 'EU'),
  DUS: P('Düsseldorf', '杜塞道夫', '뒤셀도르프', 'DE', 51.29, 6.77, 'EU'),
  HAM: P('Hamburg', '漢堡', '함부르크', 'DE', 53.63, 9.99, 'EU'),
  VIE: P('Vienna', '維也納', '비엔나', 'AT', 48.11, 16.57, 'EU'),
  PRG: P('Prague', '布拉格', '프라하', 'CZ', 50.1, 14.26, 'EU'),
  BUD: P('Budapest', '布達佩斯', '부다페스트', 'HU', 47.43, 19.26, 'EU'),
  WAW: P('Warsaw', '華沙', '바르샤바', 'PL', 52.17, 20.97, 'EU'),
  OTP: P('Bucharest', '布加勒斯特', '부쿠레슈티', 'RO', 44.57, 26.09, 'EU'),
  FCO: P('Rome', '羅馬', '로마', 'IT', 41.8, 12.25, 'EU'),
  MXP: P('Milan', '米蘭', '밀라노', 'IT', 45.63, 8.72, 'EU'),
  VCE: P('Venice', '威尼斯', '베네치아', 'IT', 45.51, 12.35, 'EU'),
  ZRH: P('Zurich', '蘇黎世', '취리히', 'CH', 47.46, 8.55, 'EU'),
  GVA: P('Geneva', '日內瓦', '제네바', 'CH', 46.24, 6.11, 'EU'),
  BCN: P('Barcelona', '巴塞隆納', '바르셀로나', 'ES', 41.3, 2.08, 'EU'),
  MAD: P('Madrid', '馬德里', '마드리드', 'ES', 40.47, -3.56, 'EU'),
  LIS: P('Lisbon', '里斯本', '리스본', 'PT', 38.77, -9.13, 'EU'),
  NCE: P('Nice', '尼斯', '니스', 'FR', 43.66, 7.21, 'EU'),
  BRU: P('Brussels', '布魯塞爾', '브뤼셀', 'BE', 50.9, 4.48, 'EU'),
  CPH: P('Copenhagen', '哥本哈根', '코펜하겐', 'DK', 55.62, 12.65, 'EU'),
  ARN: P('Stockholm', '斯德哥爾摩', '스톡홀름', 'SE', 59.65, 17.92, 'EU'),
  OSL: P('Oslo', '奧斯陸', '오슬로', 'NO', 60.19, 11.1, 'EU'),
  HEL: P('Helsinki', '赫爾辛基', '헬싱키', 'FI', 60.32, 24.96, 'EU'),
  ATH: P('Athens', '雅典', '아테네', 'GR', 37.94, 23.94, 'EU'),
  KEF: P('Reykjavik', '雷克雅維克(冰島)', '레이캬비크', 'IS', 63.99, -22.61, 'EU'),
  OPO: P('Porto', '波多', '포르투', 'PT', 41.25, -8.68, 'EU'),
  NAP: P('Naples', '拿坡里', '나폴리', 'IT', 40.89, 14.29, 'EU'),
  BLQ: P('Bologna', '波隆那', '볼로냐', 'IT', 44.53, 11.29, 'EU'),
  LIN: P('Milan Linate', '米蘭利納特', '밀라노(리나테)', 'IT', 45.45, 9.28, 'EU'),
  CIA: P('Rome Ciampino', '羅馬欽皮諾', '로마(참피노)', 'IT', 41.8, 12.59, 'EU'),
  STN: P('London Stansted', '倫敦史坦斯特', '런던(스탠스테드)', 'GB', 51.89, 0.26, 'EU'),
  LTN: P('London Luton', '倫敦盧頓', '런던(루턴)', 'GB', 51.87, -0.37, 'EU'),
  GLA: P('Glasgow', '格拉斯哥', '글래스고', 'GB', 55.87, -4.43, 'EU'),
  BHX: P('Birmingham', '伯明罕', '버밍엄', 'GB', 52.45, -1.75, 'EU'),
  AGP: P('Málaga', '馬拉加', '말라가', 'ES', 36.67, -4.5, 'EU'),
  PMI: P('Palma de Mallorca', '帕爾馬(馬約卡)', '팔마데마요르카', 'ES', 39.55, 2.74, 'EU'),
  VLC: P('Valencia', '瓦倫西亞', '발렌시아', 'ES', 39.49, -0.48, 'EU'),
  SVQ: P('Seville', '塞維亞', '세비야', 'ES', 37.42, -5.9, 'EU'),
  TFS: P('Tenerife South', '特內里費', '테네리페', 'ES', 28.04, -16.57, 'EU'),
  MRS: P('Marseille', '馬賽', '마르세유', 'FR', 43.44, 5.22, 'EU'),
  GOT: P('Gothenburg', '哥特堡', '예테보리', 'SE', 57.66, 12.28, 'EU'),
  STR: P('Stuttgart', '斯圖加特', '슈투트가르트', 'DE', 48.69, 9.22, 'EU'),
  CGN: P('Cologne', '科隆', '쾰른', 'DE', 50.87, 7.14, 'EU'),
  LUX: P('Luxembourg', '盧森堡', '룩셈부르크', 'LU', 49.63, 6.2, 'EU'),
  SKG: P('Thessaloniki', '塞薩洛尼基', '테살로니키', 'GR', 40.52, 22.97, 'EU'),
  HER: P('Heraklion (Crete)', '伊拉克里翁(克里特島)', '이라클리온(크레타)', 'GR', 35.34, 25.18, 'EU'),
  JTR: P('Santorini', '聖托里尼', '산토리니', 'GR', 36.4, 25.48, 'EU'),
  DBV: P('Dubrovnik', '杜布羅夫尼克', '두브로브니크', 'HR', 42.56, 18.27, 'EU'),
  SPU: P('Split', '斯普利特', '스플리트', 'HR', 43.54, 16.3, 'EU'),
  ZAG: P('Zagreb', '札格雷布', '자그레브', 'HR', 45.74, 16.07, 'EU'),
  LJU: P('Ljubljana', '盧比安納', '류블랴나', 'SI', 46.22, 14.46, 'EU'),
  BTS: P('Bratislava', '布拉提斯拉瓦', '브라티슬라바', 'SK', 48.17, 17.21, 'EU'),
  SOF: P('Sofia', '索菲亞', '소피아', 'BG', 42.7, 23.41, 'EU'),
  BEG: P('Belgrade', '貝爾格勒', '베오그라드', 'RS', 44.82, 20.31, 'EU'),
  TLL: P('Tallinn', '塔林', '탈린', 'EE', 59.41, 24.83, 'EU'),
  RIX: P('Riga', '里加', '리가', 'LV', 56.92, 23.97, 'EU'),
  VNO: P('Vilnius', '維爾紐斯', '빌뉴스', 'LT', 54.63, 25.29, 'EU'),
  KRK: P('Kraków', '克拉科夫', '크라쿠프', 'PL', 50.08, 19.78, 'EU'),
  // North America
  LAX: P('Los Angeles', '洛杉磯', '로스앤젤레스', 'US', 33.94, -118.41, 'NA'),
  SFO: P('San Francisco', '舊金山', '샌프란시스코', 'US', 37.62, -122.38, 'NA'),
  SEA: P('Seattle', '西雅圖', '시애틀', 'US', 47.45, -122.31, 'NA'),
  ONT: P('Ontario (CA)', '安大略(加州)', '온타리오(캘리포니아)', 'US', 34.06, -117.6, 'NA'),
  SAN: P('San Diego', '聖地牙哥', '샌디에이고', 'US', 32.73, -117.19, 'NA'),
  LAS: P('Las Vegas', '拉斯維加斯', '라스베이거스', 'US', 36.08, -115.15, 'NA'),
  PHX: P('Phoenix', '鳳凰城', '피닉스', 'US', 33.43, -112.01, 'NA'),
  PDX: P('Portland', '波特蘭', '포틀랜드', 'US', 45.59, -122.6, 'NA'),
  SLC: P('Salt Lake City', '鹽湖城', '솔트레이크시티', 'US', 40.79, -111.98, 'NA'),
  DEN: P('Denver', '丹佛', '덴버', 'US', 39.86, -104.67, 'NA'),
  DFW: P('Dallas', '達拉斯', '댈러스', 'US', 32.9, -97.04, 'NA'),
  IAH: P('Houston', '休士頓', '휴스턴', 'US', 29.98, -95.34, 'NA'),
  ORD: P('Chicago', '芝加哥', '시카고', 'US', 41.98, -87.9, 'NA'),
  MSP: P('Minneapolis', '明尼亞波利斯', '미니애폴리스', 'US', 44.88, -93.22, 'NA'),
  DTW: P('Detroit', '底特律', '디트로이트', 'US', 42.21, -83.35, 'NA'),
  ATL: P('Atlanta', '亞特蘭大', '애틀랜타', 'US', 33.64, -84.43, 'NA'),
  MIA: P('Miami', '邁阿密', '마이애미', 'US', 25.79, -80.29, 'NA'),
  JFK: P('New York JFK', '紐約', '뉴욕(JFK)', 'US', 40.64, -73.78, 'NA'),
  EWR: P('New York Newark', '紐約紐華克', '뉴욕(뉴어크)', 'US', 40.69, -74.17, 'NA'),
  LGA: P('New York LaGuardia', '紐約拉瓜迪亞', '뉴욕(라과디아)', 'US', 40.78, -73.87, 'NA'),
  BOS: P('Boston', '波士頓', '보스턴', 'US', 42.37, -71.01, 'NA'),
  IAD: P('Washington', '華盛頓', '워싱턴', 'US', 38.95, -77.46, 'NA'),
  DCA: P('Washington Reagan', '華盛頓雷根', '워싱턴(레이건)', 'US', 38.85, -77.04, 'NA'),
  BWI: P('Baltimore', '巴爾的摩', '볼티모어', 'US', 39.18, -76.67, 'NA'),
  MDW: P('Chicago Midway', '芝加哥中途島', '시카고(미드웨이)', 'US', 41.79, -87.75, 'NA'),
  PHL: P('Philadelphia', '費城', '필라델피아', 'US', 39.87, -75.24, 'NA'),
  CLT: P('Charlotte', '夏洛特', '샬럿', 'US', 35.21, -80.94, 'NA'),
  MCO: P('Orlando', '奧蘭多', '올랜도', 'US', 28.43, -81.31, 'NA'),
  FLL: P('Fort Lauderdale', '勞德岱堡', '포트로더데일', 'US', 26.07, -80.15, 'NA'),
  AUS: P('Austin', '奧斯汀', '오스틴', 'US', 30.2, -97.67, 'NA'),
  BNA: P('Nashville', '納許維爾', '내슈빌', 'US', 36.12, -86.68, 'NA'),
  SJC: P('San Jose (CA)', '聖荷西', '새너제이', 'US', 37.36, -121.93, 'NA'),
  OAK: P('Oakland', '奧克蘭(加州)', '오클랜드(캘리포니아)', 'US', 37.72, -122.22, 'NA'),
  SNA: P('Orange County', '橙縣(約翰韋恩)', '오렌지카운티', 'US', 33.68, -117.87, 'NA'),
  ANC: P('Anchorage', '安克拉治', '앵커리지', 'US', 61.17, -150.0, 'NA'),
  YYC: P('Calgary', '卡加利', '캘거리', 'CA', 51.11, -114.02, 'NA'),
  HNL: P('Honolulu', '檀香山', '호놀룰루', 'US', 21.32, -157.92, 'NA'),
  YVR: P('Vancouver', '溫哥華', '밴쿠버', 'CA', 49.19, -123.18, 'NA'),
  YYZ: P('Toronto', '多倫多', '토론토', 'CA', 43.68, -79.63, 'NA'),
  YUL: P('Montreal', '蒙特婁', '몬트리올', 'CA', 45.47, -73.74, 'NA'),
  MEX: P('Mexico City', '墨西哥城', '멕시코시티', 'MX', 19.44, -99.07, 'LATAM'),
  CUN: P('Cancún', '坎昆', '칸쿤', 'MX', 21.04, -86.87, 'LATAM'),
  PTY: P('Panama City', '巴拿馬城', '파나마시티', 'PA', 9.07, -79.38, 'LATAM'),
  BOG: P('Bogotá', '波哥大', '보고타', 'CO', 4.7, -74.15, 'LATAM'),
  LIM: P('Lima', '利馬', '리마', 'PE', -12.02, -77.11, 'LATAM'),
  GRU: P('São Paulo', '聖保羅', '상파울루', 'BR', -23.43, -46.47, 'LATAM'),
  GIG: P('Rio de Janeiro', '里約熱內盧', '리우데자네이루', 'BR', -22.81, -43.25, 'LATAM'),
  EZE: P('Buenos Aires', '布宜諾斯艾利斯', '부에노스아이레스', 'AR', -34.82, -58.54, 'LATAM'),
  SCL: P('Santiago', '聖地牙哥(智利)', '산티아고', 'CL', -33.39, -70.79, 'LATAM'),
  // Oceania
  SYD: P('Sydney', '雪梨', '시드니', 'AU', -33.94, 151.18, 'OC'),
  MEL: P('Melbourne', '墨爾本', '멜버른', 'AU', -37.67, 144.84, 'OC'),
  BNE: P('Brisbane', '布里斯本', '브리즈번', 'AU', -27.38, 153.12, 'OC'),
  PER: P('Perth', '伯斯', '퍼스', 'AU', -31.94, 115.97, 'OC'),
  ADL: P('Adelaide', '阿德雷德', '애들레이드', 'AU', -34.95, 138.53, 'OC'),
  OOL: P('Gold Coast', '黃金海岸', '골드코스트', 'AU', -28.16, 153.5, 'OC'),
  CNS: P('Cairns', '凱恩斯', '케언스', 'AU', -16.88, 145.75, 'OC'),
  AKL: P('Auckland', '奧克蘭', '오클랜드', 'NZ', -37.01, 174.79, 'OC'),
  CHC: P('Christchurch', '基督城', '크라이스트처치', 'NZ', -43.49, 172.53, 'OC'),
  WLG: P('Wellington', '威靈頓', '웰링턴', 'NZ', -41.33, 174.81, 'OC'),
  ZQN: P('Queenstown', '皇后鎮', '퀸스타운', 'NZ', -45.02, 168.74, 'OC'),
  NAN: P('Nadi (Fiji)', '斐濟楠迪', '난디(피지)', 'FJ', -17.76, 177.44, 'OC'),
  // Central Asia / Mongolia
  ALA: P('Almaty', '阿拉木圖', '알마티', 'KZ', 43.35, 77.04, 'CAS'),
  TAS: P('Tashkent', '塔什干', '타슈켄트', 'UZ', 41.26, 69.28, 'CAS'),
  UBN: P('Ulaanbaatar', '烏蘭巴托', '울란바토르', 'MN', 47.65, 106.82, 'CAS'),
};

// ── Mainland China, Hong Kong and Macau airports — ALWAYS excluded ──
// (The scanner additionally loads the full OurAirports list at run time.)
const CN_CODES = (
  'PEK PKX NAY PVG SHA CAN SZX CTU TFU CKG KMG XIY HGH NKG WUH CSX XMN FOC TAO TSN DLC SHE HRB ' +
  'CGO TNA NNG KWE HAK SYX URC LHW TYN HFE NGB WNZ KWL CGQ SJW HET INC XNN LXA JJN ZUH YNT WUX ' +
  'SWA KHN BHY LJG JHG DYG YIH WEH NTG CZX LYI JUZ YIW XUZ LYA KHG DQA YTY HUZ ZHA MIG YBP HSN ' +
  'TXN JGS WDS ENH DAT BAV CIH DSN JMU MDG YNJ TNH AQG JDZ JIU KOW LZH WUS SQJ LCX ZAT DLU TCZ ' +
  'LUM SYM AKU HMI KRL YIN HTN GOQ XFN YCU HDG TVS SHP CHG DDG JNZ AOG NZH HLD ERL ZQZ RIZ WXN ' +
  'NBS HZG LLF HNY YZY DIG NLT FUG WHA ZYI BPX JNG LNJ HYN'
).split(' ');

export const CHINA_REGION_COUNTRIES = new Set(['CN', 'HK', 'MO']);

// 'BJS' is the IATA metropolitan code for Beijing (PEK + PKX): not an airport, but searches accept it.
export const BLOCKED_AIRPORTS = new Set([...CN_CODES, 'BJS', 'HKG', 'MFM']);

export function airportInfo(code) {
  return AIRPORTS[code] || null;
}

export function airportCity(code, lang = 'en') {
  const a = AIRPORTS[code];
  if (!a) return code;
  if (lang.startsWith('zh')) return a.zh;
  if (lang.startsWith('ko')) return a.ko;
  return a.en;
}

export function airportRegion(code) {
  if (BLOCKED_AIRPORTS.has(code)) return 'CN';
  return AIRPORTS[code]?.region || 'OTHER';
}

// Country for the exclusion filter: built-in DB first, then optional extra map
// (OurAirports / provider-supplied). Returns null when unknown.
export function airportCountry(code, extra) {
  if (!code) return null;
  if (code === 'HKG') return 'HK';
  if (code === 'MFM') return 'MO';
  if (BLOCKED_AIRPORTS.has(code)) return 'CN';
  if (AIRPORTS[code]) return AIRPORTS[code].country;
  if (extra) {
    const c = typeof extra.get === 'function' ? extra.get(code) : extra[code];
    if (c) return c;
  }
  return null;
}

const toRad = (d) => (d * Math.PI) / 180;

// Great-circle distance in km (null if either airport lacks coordinates).
export function distanceKm(a, b) {
  const A = AIRPORTS[a];
  const B = AIRPORTS[b];
  if (!A || !B) return null;
  const R = 6371;
  const dLat = toRad(B.lat - A.lat);
  const dLon = toRad(B.lon - A.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(A.lat)) * Math.cos(toRad(B.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
