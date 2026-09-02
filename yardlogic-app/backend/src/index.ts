import app from "./app";
import { runNotificationChecksForAllBusinesses, startNotificationScheduler } from "./routes/notifications";

const port = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(port, () => console.log(`Vyapar+ API listening on :${port}`));
  startNotificationScheduler();
  runNotificationChecksForAllBusinesses().catch((error) => console.error("Initial notification check failed:", error));
}

export default app;
