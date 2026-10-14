// Node-only: reasoning calls can run past undici's 5-minute default header timeout.
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));
