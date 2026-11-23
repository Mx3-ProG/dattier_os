import { config } from "zod/v4/core";

// Sans ce réglage, Zod teste `new Function("")` au chargement : la CSP signale alors
// une violation sur chaque page, même si l'exception est absorbée.
config({ jitless: true });
