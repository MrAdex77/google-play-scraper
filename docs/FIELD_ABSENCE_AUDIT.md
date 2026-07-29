# Field Absence Audit

| Feature      | Field       | Policy         | Evidence kind    | Evidence                                                 |
| ------------ | ----------- | -------------- | ---------------- | -------------------------------------------------------- |
| cluster item | `title`     | required       | established test | paid and priceless cluster item tests provide a title    |
| cluster item | `appId`     | required       | established test | paid and priceless cluster item tests provide an app id  |
| cluster item | `url`       | required       | established test | missing link test requires a `SpecError` naming `url`    |
| cluster item | `icon`      | required       | established test | cluster item builders always provide the icon spine      |
| cluster item | `developer` | required       | established test | cluster item builders always provide the developer spine |
| cluster item | `currency`  | optional       | established test | missing price cell yields `currency: undefined`          |
| cluster item | `price`     | default `0`    | established test | missing price cell yields `price: 0`                     |
| cluster item | `free`      | default `true` | established test | missing price cell yields `free: true`                   |
| cluster item | `summary`   | optional       | pinned reference | absent optional item metadata remains undefined          |
| cluster item | `scoreText` | optional       | pinned reference | absent optional item metadata remains undefined          |
| cluster item | `score`     | optional       | pinned reference | absent optional item metadata remains undefined          |
