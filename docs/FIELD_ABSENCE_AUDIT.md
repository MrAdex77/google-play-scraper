# Field Absence Audit

| Feature      | Field                       | Policy                                              | Evidence kind    | Evidence                                                    |
| ------------ | --------------------------- | --------------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| cluster item | `title`                     | required                                            | established test | paid and priceless cluster item tests provide a title       |
| cluster item | `appId`                     | required                                            | established test | paid and priceless cluster item tests provide an app id     |
| cluster item | `url`                       | required                                            | established test | missing link test requires a `SpecError` naming `url`       |
| cluster item | `icon`                      | required                                            | established test | cluster item builders always provide the icon spine         |
| cluster item | `developer`                 | required                                            | established test | cluster item builders always provide the developer spine    |
| cluster item | `currency`                  | optional                                            | established test | missing price cell yields `currency: undefined`             |
| cluster item | `price`                     | default `0`                                         | established test | missing price cell yields `price: 0`                        |
| cluster item | `free`                      | default `true`                                      | established test | missing price cell yields `free: true`                      |
| cluster item | `summary`                   | optional                                            | pinned reference | absent optional item metadata remains undefined             |
| cluster item | `scoreText`                 | optional                                            | pinned reference | absent optional item metadata remains undefined             |
| cluster item | `score`                     | optional                                            | pinned reference | absent optional item metadata remains undefined             |
| app          | `title`                     | required                                            | recorded fixture | present in all app fixtures                                 |
| app          | `description`               | required                                            | recorded fixture | detail container present in all app fixtures                |
| app          | `descriptionHTML`           | required                                            | recorded fixture | detail container present in all app fixtures                |
| app          | `summary`                   | optional                                            | pinned reference | absent optional metadata remains undefined                  |
| app          | `installs`                  | optional                                            | pinned reference | absent optional metadata remains undefined                  |
| app          | `minInstalls`               | optional                                            | pinned reference | absent optional metadata remains undefined                  |
| app          | `maxInstalls`               | optional                                            | pinned reference | absent optional metadata remains undefined                  |
| app          | `score`                     | optional                                            | pinned reference | unrated listings may omit score metadata                    |
| app          | `scoreText`                 | optional                                            | pinned reference | unrated listings may omit score metadata                    |
| app          | `ratings`                   | optional                                            | pinned reference | unrated listings may omit rating counts                     |
| app          | `reviews`                   | optional                                            | pinned reference | listings may omit review counts                             |
| app          | `histogram`                 | default zeroed                                      | established test | unrated listings yield a zero filled histogram              |
| app          | `price`                     | required                                            | recorded fixture | price micros present in all app fixtures                    |
| app          | `originalPrice`             | optional                                            | recorded fixture | absent in all app fixtures without an active discount       |
| app          | `discountEndDate`           | optional                                            | established test | discount timestamp parses, non numeric timestamp rejects    |
| app          | `free`                      | required                                            | recorded fixture | price micros present in all app fixtures                    |
| app          | `currency`                  | optional                                            | pinned reference | absent currency remains undefined                           |
| app          | `priceText`                 | required                                            | recorded fixture | price text present in all app fixtures                      |
| app          | `available`                 | default `false`                                     | established test | absent availability source yields an unavailable listing    |
| app          | `offersIAP`                 | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `IAPRange`                  | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `androidVersion`            | default `VARY`                                      | established test | absent version block yields `VARY`                          |
| app          | `androidVersionText`        | default `Varies with device`                        | established test | absent version block yields the device-varying label        |
| app          | `androidMaxVersion`         | default `VARY`                                      | recorded fixture | absent in all three app fixtures                            |
| app          | `developer`                 | required                                            | recorded fixture | present in all app fixtures                                 |
| app          | `developerId`               | required                                            | recorded fixture | developer link present in all app fixtures                  |
| app          | `developerEmail`            | optional                                            | established test | absent developer section yields undefined                   |
| app          | `developerWebsite`          | optional                                            | pinned reference | absent optional contact metadata remains undefined          |
| app          | `developerAddress`          | optional                                            | recorded fixture | absent in all three app fixtures                            |
| app          | `developerLegalName`        | optional                                            | pinned reference | absent optional legal metadata remains undefined            |
| app          | `developerLegalEmail`       | optional                                            | pinned reference | absent optional legal metadata remains undefined            |
| app          | `developerLegalAddress`     | optional                                            | established test | absent developer section yields undefined                   |
| app          | `developerLegalPhoneNumber` | optional                                            | established test | absent developer section yields undefined                   |
| app          | `privacyPolicy`             | optional                                            | pinned reference | absent optional policy link remains undefined               |
| app          | `developerInternalID`       | required                                            | recorded fixture | developer link present in all app fixtures                  |
| app          | `genre`                     | required                                            | recorded fixture | present in all app fixtures                                 |
| app          | `genreId`                   | required                                            | recorded fixture | present in all app fixtures                                 |
| app          | `categories`                | required                                            | recorded fixture | detail container present in all app fixtures                |
| app          | `icon`                      | required                                            | recorded fixture | present in all app fixtures                                 |
| app          | `headerImage`               | optional                                            | pinned reference | absent optional artwork remains undefined                   |
| app          | `screenshots`               | required                                            | recorded fixture | screenshot collection present in all app fixtures           |
| app          | `video`                     | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `videoImage`                | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `previewVideo`              | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `contentRating`             | optional                                            | pinned reference | absent optional rating metadata remains undefined           |
| app          | `contentRatingDescription`  | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `adSupported`               | default `false`                                     | recorded fixture | absent in `translate.html` and `minecraft.html`             |
| app          | `released`                  | optional                                            | recorded fixture | absent in `translate.html`                                  |
| app          | `updated`                   | required                                            | recorded fixture | update timestamp present in all app fixtures                |
| app          | `version`                   | default `VARY`                                      | established test | absent version block yields `VARY`                          |
| app          | `recentChanges`             | optional                                            | pinned reference | absent changelog remains undefined                          |
| app          | `comments`                  | default `[]` declared, unreachable in `app()`       | established test | an absent-marker root yields `[]`, a malformed root rejects |
| app          | `preregister`               | default `false`                                     | established test | absent availability source yields no preregistration        |
| app          | `earlyAccessEnabled`        | default `false`                                     | recorded fixture | absent in all three app fixtures                            |
| app          | `isAvailableInPlayPass`     | default `false`                                     | recorded fixture | absent in all three app fixtures                            |
| search       | `title`                     | required                                            | recorded fixture | search fixtures populate every result title                 |
| search       | `appId`                     | required                                            | recorded fixture | search fixtures populate every result app id                |
| search       | `url`                       | required                                            | recorded fixture | search fixtures populate every result link                  |
| search       | `icon`                      | required                                            | recorded fixture | search fixtures populate every result icon                  |
| search       | `developer`                 | required                                            | recorded fixture | search fixtures populate every result developer             |
| search       | `developerId`               | optional                                            | pinned reference | exact-match developer id may be absent                      |
| search       | `currency`                  | optional                                            | pinned reference | absent optional currency remains undefined                  |
| search       | `price`                     | required on results, default `0` on exact match     | established test | priceless exact match yields `price: 0`                     |
| search       | `free`                      | required on results, default `false` on exact match | established test | priceless exact match yields `free: false`                  |
| search       | `summary`                   | optional                                            | pinned reference | absent optional summary remains undefined                   |
| search       | `scoreText`                 | optional                                            | pinned reference | unrated results may omit score metadata                     |
| search       | `score`                     | optional                                            | pinned reference | unrated results may omit score metadata                     |
| list         | `title`                     | required                                            | recorded fixture | list fixture populates every item title                     |
| list         | `appId`                     | required                                            | recorded fixture | list fixture populates every item app id                    |
| list         | `url`                       | required                                            | established test | missing link test requires a `SpecError` naming `url`       |
| list         | `icon`                      | required                                            | recorded fixture | list fixture populates every item icon                      |
| list         | `developer`                 | required                                            | recorded fixture | list fixture populates every item developer                 |
| list         | `currency`                  | optional                                            | established test | priceless row yields `currency: undefined`                  |
| list         | `price`                     | default `0`                                         | established test | priceless row yields `price: 0`                             |
| list         | `free`                      | default `false`                                     | established test | priceless row yields `free: false`                          |
| list         | `summary`                   | optional                                            | pinned reference | absent optional summary remains undefined                   |
| list         | `scoreText`                 | optional                                            | pinned reference | unrated rows may omit score metadata                        |
| list         | `score`                     | optional                                            | pinned reference | unrated rows may omit score metadata                        |
| developer    | `title`                     | required                                            | recorded fixture | both developer layouts populate item titles                 |
| developer    | `appId`                     | required                                            | recorded fixture | both developer layouts populate app ids                     |
| developer    | `url`                       | required                                            | recorded fixture | both developer layouts populate item links                  |
| developer    | `icon`                      | required                                            | recorded fixture | both developer layouts populate item icons                  |
| developer    | `developer`                 | required                                            | recorded fixture | both developer layouts populate developer names             |
| developer    | `currency`                  | optional                                            | pinned reference | absent optional currency remains undefined                  |
| developer    | `price`                     | default `0`                                         | established test | priceless name-layout row yields `price: 0`                 |
| developer    | `free`                      | default `false`                                     | established test | priceless name-layout row yields `free: false`              |
| developer    | `summary`                   | optional                                            | pinned reference | absent optional summary remains undefined                   |
| developer    | `scoreText`                 | optional                                            | pinned reference | unrated apps may omit score metadata                        |
| developer    | `score`                     | optional                                            | pinned reference | unrated apps may omit score metadata                        |
| similar      | `title`                     | required                                            | recorded fixture | similar fixture populates item titles                       |
| similar      | `appId`                     | required                                            | recorded fixture | similar fixture populates app ids                           |
| similar      | `url`                       | required                                            | recorded fixture | similar fixture populates item links                        |
| similar      | `icon`                      | required                                            | recorded fixture | similar fixture populates item icons                        |
| similar      | `developer`                 | required                                            | recorded fixture | similar fixture populates developer names                   |
| similar      | `currency`                  | optional                                            | pinned reference | absent optional currency remains undefined                  |
| similar      | `price`                     | default `0`                                         | established test | priceless similar row yields `price: 0`                     |
| similar      | `free`                      | default `false`                                     | established test | priceless similar row yields `free: false`                  |
| similar      | `summary`                   | optional                                            | pinned reference | absent optional summary remains undefined                   |
| similar      | `scoreText`                 | optional                                            | pinned reference | unrated apps may omit score metadata                        |
| similar      | `score`                     | optional                                            | pinned reference | unrated apps may omit score metadata                        |
| reviews      | `id`                        | required                                            | recorded fixture | every recorded review carries an id                         |
| reviews      | `userName`                  | required                                            | recorded fixture | every recorded review carries a user name                   |
| reviews      | `userImage`                 | optional                                            | pinned reference | absent optional user image remains undefined                |
| reviews      | `date`                      | required                                            | recorded fixture | every recorded review carries a date tuple                  |
| reviews      | `score`                     | required                                            | recorded fixture | every recorded review carries a score                       |
| reviews      | `title`                     | required                                            | pinned reference | title derives from the required review id source            |
| reviews      | `text`                      | optional                                            | pinned reference | reviews may omit text                                       |
| reviews      | `replyDate`                 | optional                                            | pinned reference | reviews without a developer reply omit its date             |
| reviews      | `replyText`                 | optional                                            | pinned reference | reviews without a developer reply omit its text             |
| reviews      | `version`                   | optional                                            | pinned reference | reviews may omit the app version                            |
| reviews      | `thumbsUp`                  | optional                                            | pinned reference | absent optional vote count remains undefined                |
| reviews      | `criterias`                 | default `[]`                                        | recorded fixture | reviews without criteria retain an empty criteria list      |
| dataSafety   | `sharedData`                | default `[]`                                        | established test | missing-app response yields an empty report                 |
| dataSafety   | `collectedData`             | default `[]`                                        | established test | missing-app response yields an empty report                 |
| dataSafety   | `securityPractices`         | default `[]`                                        | established test | missing-app response yields an empty report                 |
| dataSafety   | `privacyPolicyUrl`          | optional                                            | established test | missing-app response omits the policy link                  |

## Reading the evidence column

`recorded fixture` evidence means a field is present in every recorded fixture. That is evidence a field is
usually populated, not evidence it is structurally guaranteed. The fixture set records popular, rated, globally
available listings, so a source that is present in all three fixtures can still be absent on an unrated listing,
a brand new listing, or a listing restricted to another storefront. Classify a field as `required` only when an
absent source means the response is genuinely unusable, and prefer `established test` evidence that exercises
the absent case directly. The live contract tests in `e2e/edgeCases.e2e.test.ts` cover the listing shapes the
fixtures do not.
