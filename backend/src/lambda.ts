// Production Lambda entry point.
// Deploy with: zip -r function.zip dist/ node_modules/
import { handle } from "hono/aws-lambda";
import app from "./app";

export const handler = handle(app);
