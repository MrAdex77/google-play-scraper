import * as library from '../src/index.ts';
import { isScenarioName, settle } from './scenarios.ts';

const SCENARIO_PARAM = 'scenario';

export default {
  async fetch(request: Request): Promise<Response> {
    const name = new URL(request.url).searchParams.get(SCENARIO_PARAM);
    if (!isScenarioName(name)) {
      return new Response(`unknown scenario ${String(name)}`, { status: 400 });
    }
    return Response.json(await settle(name, library));
  },
};
