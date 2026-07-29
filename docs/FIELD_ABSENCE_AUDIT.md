# Field Absence Audit

| Feature      | Field                       | Policy                       | Evidence kind    | Evidence                                                    |
| ------------ | --------------------------- | ---------------------------- | ---------------- | ----------------------------------------------------------- |
| cluster item | `title`                     | required                     | established test | paid and priceless cluster item tests provide a title       |
| cluster item | `appId`                     | required                     | established test | paid and priceless cluster item tests provide an app id     |
| cluster item | `url`                       | required                     | established test | missing link test requires a `SpecError` naming `url`       |
| cluster item | `icon`                      | required                     | established test | cluster item builders always provide the icon spine         |
| cluster item | `developer`                 | required                     | established test | cluster item builders always provide the developer spine    |
| cluster item | `currency`                  | optional                     | established test | missing price cell yields `currency: undefined`             |
| cluster item | `price`                     | default `0`                  | established test | missing price cell yields `price: 0`                        |
| cluster item | `free`                      | default `true`               | established test | missing price cell yields `free: true`                      |
| cluster item | `summary`                   | optional                     | pinned reference | absent optional item metadata remains undefined             |
| cluster item | `scoreText`                 | optional                     | pinned reference | absent optional item metadata remains undefined             |
| cluster item | `score`                     | optional                     | pinned reference | absent optional item metadata remains undefined             |
| app          | `title`                     | required                     | recorded fixture | present in all app fixtures                                 |
| app          | `description`               | required                     | recorded fixture | detail container present in all app fixtures                |
| app          | `descriptionHTML`           | required                     | recorded fixture | detail container present in all app fixtures                |
| app          | `summary`                   | optional                     | pinned reference | absent optional metadata remains undefined                  |
| app          | `installs`                  | optional                     | pinned reference | absent optional metadata remains undefined                  |
| app          | `minInstalls`               | optional                     | pinned reference | absent optional metadata remains undefined                  |
| app          | `maxInstalls`               | optional                     | pinned reference | absent optional metadata remains undefined                  |
| app          | `score`                     | optional                     | pinned reference | unrated listings may omit score metadata                    |
| app          | `scoreText`                 | optional                     | pinned reference | unrated listings may omit score metadata                    |
| app          | `ratings`                   | optional                     | pinned reference | unrated listings may omit rating counts                     |
| app          | `reviews`                   | optional                     | pinned reference | listings may omit review counts                             |
| app          | `histogram`                 | required                     | recorded fixture | histogram source present in all app fixtures                |
| app          | `price`                     | required                     | recorded fixture | price micros present in all app fixtures                    |
| app          | `originalPrice`             | optional                     | recorded fixture | absent in all app fixtures without an active discount       |
| app          | `discountEndDate`           | optional                     | recorded fixture | absent in all app fixtures without an active discount       |
| app          | `free`                      | required                     | recorded fixture | price micros present in all app fixtures                    |
| app          | `currency`                  | optional                     | pinned reference | absent currency remains undefined                           |
| app          | `priceText`                 | required                     | recorded fixture | price text present in all app fixtures                      |
| app          | `available`                 | required                     | recorded fixture | availability source present in all app fixtures             |
| app          | `offersIAP`                 | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `IAPRange`                  | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `androidVersion`            | default `VARY`               | established test | absent version block yields `VARY`                          |
| app          | `androidVersionText`        | default `Varies with device` | established test | absent version block yields the device-varying label        |
| app          | `androidMaxVersion`         | default `VARY`               | recorded fixture | absent in all three app fixtures                            |
| app          | `developer`                 | required                     | recorded fixture | present in all app fixtures                                 |
| app          | `developerId`               | required                     | recorded fixture | developer link present in all app fixtures                  |
| app          | `developerEmail`            | optional                     | established test | absent developer section yields undefined                   |
| app          | `developerWebsite`          | optional                     | pinned reference | absent optional contact metadata remains undefined          |
| app          | `developerAddress`          | optional                     | recorded fixture | absent in all three app fixtures                            |
| app          | `developerLegalName`        | optional                     | pinned reference | absent optional legal metadata remains undefined            |
| app          | `developerLegalEmail`       | optional                     | pinned reference | absent optional legal metadata remains undefined            |
| app          | `developerLegalAddress`     | optional                     | established test | absent developer section yields undefined                   |
| app          | `developerLegalPhoneNumber` | optional                     | established test | absent developer section yields undefined                   |
| app          | `privacyPolicy`             | optional                     | pinned reference | absent optional policy link remains undefined               |
| app          | `developerInternalID`       | required                     | recorded fixture | developer link present in all app fixtures                  |
| app          | `genre`                     | required                     | recorded fixture | present in all app fixtures                                 |
| app          | `genreId`                   | required                     | recorded fixture | present in all app fixtures                                 |
| app          | `categories`                | required                     | recorded fixture | detail container present in all app fixtures                |
| app          | `icon`                      | required                     | recorded fixture | present in all app fixtures                                 |
| app          | `headerImage`               | optional                     | pinned reference | absent optional artwork remains undefined                   |
| app          | `screenshots`               | required                     | recorded fixture | screenshot collection present in all app fixtures           |
| app          | `video`                     | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `videoImage`                | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `previewVideo`              | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `contentRating`             | optional                     | pinned reference | absent optional rating metadata remains undefined           |
| app          | `contentRatingDescription`  | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `adSupported`               | default `false`              | recorded fixture | absent in `translate.html` and `minecraft.html`             |
| app          | `released`                  | optional                     | recorded fixture | absent in `translate.html`                                  |
| app          | `updated`                   | required                     | recorded fixture | update timestamp present in all app fixtures                |
| app          | `version`                   | default `VARY`               | established test | absent version block yields `VARY`                          |
| app          | `recentChanges`             | optional                     | pinned reference | absent changelog remains undefined                          |
| app          | `comments`                  | required                     | pinned reference | extraction currently receives the declared whole-block root |
| app          | `preregister`               | required                     | recorded fixture | availability source present in all app fixtures             |
| app          | `earlyAccessEnabled`        | default `false`              | recorded fixture | absent in all three app fixtures                            |
| app          | `isAvailableInPlayPass`     | default `false`              | recorded fixture | absent in all three app fixtures                            |
