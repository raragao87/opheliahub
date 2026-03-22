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
import { fundRouter } from "./routers/fund";
import { chatRouter } from "./routers/chat";
import { duplicatesRouter } from "./routers/duplicates";
import { notesRouter } from "./routers/notes";

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
  fund: fundRouter,
  chat: chatRouter,
  duplicates: duplicatesRouter,
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
