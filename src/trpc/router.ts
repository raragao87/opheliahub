import { router } from "./init";
import { authRouter } from "./routers/auth";
import { householdRouter } from "./routers/household";
import { accountRouter } from "./routers/account";
import { transactionRouter } from "./routers/transaction";
import { categoryRouter } from "./routers/category";
import { tagRouter } from "./routers/tag";
import { trackerRouter } from "./routers/tracker";
import { importRouter } from "./routers/import";
import { dashboardRouter } from "./routers/dashboard";
import { netWorthRouter } from "./routers/net-worth";
import { recurringRouter } from "./routers/recurring";
import { opheliaRouter } from "./routers/ophelia";
import { feedbackRouter } from "./routers/feedback";

export const appRouter = router({
  auth: authRouter,
  household: householdRouter,
  account: accountRouter,
  transaction: transactionRouter,
  category: categoryRouter,
  tag: tagRouter,
  tracker: trackerRouter,
  import: importRouter,
  dashboard: dashboardRouter,
  netWorth: netWorthRouter,
  recurring: recurringRouter,
  ophelia: opheliaRouter,
  feedback: feedbackRouter,
});

export type AppRouter = typeof appRouter;
