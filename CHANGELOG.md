# Changelog

## [0.4.1](https://github.com/MrAdex77/google-play-scraper/compare/v0.4.0...v0.4.1) (2026-07-15)


### Bug Fixes

* **search:** degrade gracefully when a cluster page fails to parse ([af7c649](https://github.com/MrAdex77/google-play-scraper/commit/af7c64958ff3b633df86f6034fe7c7af3a920288))
* **search:** degrade gracefully when a cluster page fails to parse ([9148f62](https://github.com/MrAdex77/google-play-scraper/commit/9148f621c07d3ba412171d77eea5e92bbbcd6ac3))

## [0.4.0](https://github.com/MrAdex77/google-play-scraper/compare/v0.3.0...v0.4.0) (2026-07-15)


### Features

* **apps:** add batch app details helper ([48157af](https://github.com/MrAdex77/google-play-scraper/commit/48157afc2ea55fca0466ca3d1f5419944cefe0ae))
* **availability:** add country availability helper ([f0c946c](https://github.com/MrAdex77/google-play-scraper/commit/f0c946c33cf7006ab8840f477aa8d159361a1cc1))
* **client:** add createClient factory with cross call throttling ([1f40a44](https://github.com/MrAdex77/google-play-scraper/commit/1f40a44b3502f7996ace3d9295ee18b4f36f8a74))
* **client:** bind iterators to the shared client ([b64eaf2](https://github.com/MrAdex77/google-play-scraper/commit/b64eaf2e4c0682b4aafe059cf4bf2a32357b1610))
* **client:** expose apps on shared and memoized clients ([cb26489](https://github.com/MrAdex77/google-play-scraper/commit/cb264899c0863794e7a6ca70368e7cd363b27aeb))
* **client:** expose availability on shared and memoized clients ([e5c73bc](https://github.com/MrAdex77/google-play-scraper/commit/e5c73bc63244d532c145acce85bb34fc80fb5f85))
* **core:** add order preserving concurrency mapper ([44b551e](https://github.com/MrAdex77/google-play-scraper/commit/44b551e4df6c045a008a923a061003183d48b225))
* **core:** support shared rate limiter injection in http client ([14f965d](https://github.com/MrAdex77/google-play-scraper/commit/14f965dca60af2d9dcf94feb393620b254405e00))
* **developer:** add streaming developer iterator ([3d237c5](https://github.com/MrAdex77/google-play-scraper/commit/3d237c5a711ac5d6c163a5838cd3b1d1b9040f55))
* **reviews:** add reviews iterator and reviews all helper ([79d4566](https://github.com/MrAdex77/google-play-scraper/commit/79d4566f6c4ca6a918dd93ac8d239329f14d2689))
* **search:** add streaming search iterator ([f3ed8d3](https://github.com/MrAdex77/google-play-scraper/commit/f3ed8d398d3bfdd1f6ca62baccb851bfdf08f574))

## [0.3.0](https://github.com/MrAdex77/google-play-scraper/compare/v0.2.0...v0.3.0) (2026-07-09)


### Features

* **core:** add createCountryFetch per-country fetch router ([d13623f](https://github.com/MrAdex77/google-play-scraper/commit/d13623fa5189071f415e61d756dd01d0f1e4363f))
* **core:** support caller abort signals in request options ([c527622](https://github.com/MrAdex77/google-play-scraper/commit/c527622505acf3a985175e19a30ccf6491fdce60))


### Bug Fixes

* **memoized:** key cached calls by function and signal identity ([d95e76d](https://github.com/MrAdex77/google-play-scraper/commit/d95e76d5a673252a5d4b922af54508e05307efdf))

## [0.2.0](https://github.com/MrAdex77/google-play-scraper/compare/v0.1.1...v0.2.0) (2026-07-08)


### Features

* **core:** add control-character text sanitizer ([e0ad03c](https://github.com/MrAdex77/google-play-scraper/commit/e0ad03c40d21dd1cdeda70afd8795d255641adbb))


### Bug Fixes

* **app:** strip control characters from description and changelog ([4835a58](https://github.com/MrAdex77/google-play-scraper/commit/4835a58e4649dae5750f322e72645e8457396591))
* **developer:** fall back to alternate layout when apps are empty ([ca3c6b4](https://github.com/MrAdex77/google-play-scraper/commit/ca3c6b422f2a02215d88822c08248ca5b81d0219))
* **developer:** fall back to alternate layout when apps are empty ([03fd28f](https://github.com/MrAdex77/google-play-scraper/commit/03fd28ff14595baac3ad39884f2437222aa5b1fe))
* **reviews:** strip control characters from review text ([06260cf](https://github.com/MrAdex77/google-play-scraper/commit/06260cf4c78a1ada393868d94734681471e569ef))
* **search:** enforce price filter client-side ([7bd2b69](https://github.com/MrAdex77/google-play-scraper/commit/7bd2b694279d88e19b20b427c2e7128bdb3e015f))
* **search:** enforce price filter client-side ([2a56f47](https://github.com/MrAdex77/google-play-scraper/commit/2a56f4776ce6ffc855c5a5d1bd7a22ada31003a4))

## [0.1.1](https://github.com/MrAdex77/google-play-scraper/compare/v0.1.0...v0.1.1) (2026-07-08)


### Miscellaneous Chores

* release 0.1.1 ([9556912](https://github.com/MrAdex77/google-play-scraper/commit/95569122782f79a0f08e82b9e11b76637475ad5c))

## 0.1.0 (2026-07-08)

### Features

- **app:** add transforms and result schema ([e1f95ed](https://github.com/MrAdex77/google-play-scraper/commit/e1f95ed6d3468e0117b90553fa23cfb47b4ee399))
- **app:** implement app details method ([ee28b2d](https://github.com/MrAdex77/google-play-scraper/commit/ee28b2da3088019d8b1c5d0c5a5c3b2db11effdb))
- **app:** port field specs from reference mappings ([555daf9](https://github.com/MrAdex77/google-play-scraper/commit/555daf9c30c95a11c3736a2af1be47c255eb8d15))
- **cache:** add memoized client backed by lru cache ([89dcc7c](https://github.com/MrAdex77/google-play-scraper/commit/89dcc7c8acde42a7da399a437955f7bd065a7073))
- **categories:** implement categories scraper ([1d87538](https://github.com/MrAdex77/google-play-scraper/commit/1d87538562791c65ff6be4d3efa55fafb46b5f65))
- **categories:** return full category taxonomy ([1464d82](https://github.com/MrAdex77/google-play-scraper/commit/1464d8232c740bfa9852a3d695a2133c1dee3801))
- **constants:** add family subcategory codes ([cdfd1d1](https://github.com/MrAdex77/google-play-scraper/commit/cdfd1d1cc7e98668cb960ded61576cef5dba1be2))
- **constants:** port play store enums and base url ([3af88ae](https://github.com/MrAdex77/google-play-scraper/commit/3af88ae0b807e0d2a09471aeecb75c07d9339d3c))
- **core:** add batchexecute codec ([58bb6a9](https://github.com/MrAdex77/google-play-scraper/commit/58bb6a9550530b0296d0011fe556abe7319cb7af))
- **core:** add cluster pagination and full detail resolver ([643907e](https://github.com/MrAdex77/google-play-scraper/commit/643907e92d9dff13324d60db79d93d0977335fde))
- **core:** add error taxonomy ([a8d1e07](https://github.com/MrAdex77/google-play-scraper/commit/a8d1e07293eda14e18c1c7d51adec8f29c85b4a0))
- **core:** add http client with retry throttle and block detection ([0993154](https://github.com/MrAdex77/google-play-scraper/commit/0993154d6a30f915e49417b9fec6e439acabb870))
- **core:** add safe path resolver ([c0d2aa6](https://github.com/MrAdex77/google-play-scraper/commit/c0d2aa602c5d12509575b965aa477a7dd0d0081f))
- **core:** add script data parser without eval ([469cd42](https://github.com/MrAdex77/google-play-scraper/commit/469cd427f8152759ca3d96ed79bca8667bb85797))
- **core:** add shared option schemas ([ecec9d4](https://github.com/MrAdex77/google-play-scraper/commit/ecec9d4617d88e3d99ea3a463ed5e995efe00eb9))
- **core:** add spec extractor with fallbacks and aggregate errors ([49a0d87](https://github.com/MrAdex77/google-play-scraper/commit/49a0d8787feee235bafc4053aeab06eed36a46fc))
- **datasafety:** implement data safety scraper ([33ca4ce](https://github.com/MrAdex77/google-play-scraper/commit/33ca4cefcc8ba47acf58ab945da83f276fc9c087))
- **developer:** implement developer method ([c3f1931](https://github.com/MrAdex77/google-play-scraper/commit/c3f19318b15b9a4a4632276c1213a15bbafbae91))
- **developer:** port developer cluster specs ([50b4331](https://github.com/MrAdex77/google-play-scraper/commit/50b43318aa4c20f662e8e3daa7d462eb724ea021))
- **list:** implement list method ([75dd6cc](https://github.com/MrAdex77/google-play-scraper/commit/75dd6ccb951aefdbc871612bced96e8e1610dc59))
- **list:** port cluster payload template and specs ([bfb09f8](https://github.com/MrAdex77/google-play-scraper/commit/bfb09f83ebdb41824cc67611d20b800c888acf4b))
- **permissions:** implement permissions rpc method ([274fa0b](https://github.com/MrAdex77/google-play-scraper/commit/274fa0b5f215fd4a7cd757f4a8973b5b5a03f325))
- **reviews:** implement reviews with token pagination ([a0ac7c9](https://github.com/MrAdex77/google-play-scraper/commit/a0ac7c9573a5deaff7e3db600f533f9c76dfecc7))
- **reviews:** port review rpc templates and mappings ([74233ea](https://github.com/MrAdex77/google-play-scraper/commit/74233ea812df7a52c1f2fb9990d7c403f8f84f63))
- **search:** implement search with pagination ([e75335e](https://github.com/MrAdex77/google-play-scraper/commit/e75335e01880a057d81c4f0b6d9d233ccd2c0f48))
- **search:** port search and exact match specs ([f5cc035](https://github.com/MrAdex77/google-play-scraper/commit/f5cc03592d5a009b4b52ad506fbb85e921de12f9))
- **similar:** implement similar method ([d27294c](https://github.com/MrAdex77/google-play-scraper/commit/d27294c64e4e70681124b1e72b045df66b325958))
- **similar:** port cluster discovery specs ([b000835](https://github.com/MrAdex77/google-play-scraper/commit/b00083532996f3687f4315a6416dd46cbf555a41))
- **suggest:** implement suggest method ([67b3922](https://github.com/MrAdex77/google-play-scraper/commit/67b39225b3ffff66a33e24c098da0f1e2620f795))
- **suggest:** port suggest rpc spec ([6543650](https://github.com/MrAdex77/google-play-scraper/commit/6543650514a21b33fd5f1aecd1d1ae2fb7998a91))

### Miscellaneous Chores

- prepare initial release ([4bf4cdc](https://github.com/MrAdex77/google-play-scraper/commit/4bf4cdceec968cbb5273ad65436bb31be01059d5))
