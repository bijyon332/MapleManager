import { onRequest as __api_js_onRequest } from "C:\\Users\\tomo_\\Desktop\\omotya\\GMS\\MapleManager\\functions\\api.js"
import { onRequest as __mapleranks_js_onRequest } from "C:\\Users\\tomo_\\Desktop\\omotya\\GMS\\MapleManager\\functions\\mapleranks.js"

export const routes = [
    {
      routePath: "/api",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__api_js_onRequest],
    },
  {
      routePath: "/mapleranks",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__mapleranks_js_onRequest],
    },
  ]