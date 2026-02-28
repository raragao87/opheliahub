import "server-only";
import { createCallerFactory, createTRPCContext } from "./init";
import { appRouter } from "./router";

const createCaller = createCallerFactory(appRouter);

export async function api() {
  const context = await createTRPCContext();
  return createCaller(context);
}
