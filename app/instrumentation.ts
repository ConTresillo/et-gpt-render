import { OpenTelemetry } from "@ai-sdk/otel";
import { registerOTel } from "@vercel/otel";
import { registerTelemetry } from "ai";

export async function register() {
  registerOTel({ serviceName: "et-gpt" });
  registerTelemetry(new OpenTelemetry());
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getBoss } = await import("./lib/workers/boss");
    await getBoss().catch((err) => {
      console.error("[instrumentation] pg-boss failed to start", err);
    });
  }
}
