import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createConfiguredCampaignApi} from '../src/campaign-api.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.TG_CAMPAIGN_PORT||18745);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
if((process.env.TG_API_KEY||'').length<24)throw new Error('TG_API_KEY must be configured (24+ characters)');
const {server}=createConfiguredCampaignApi(process.env,{webRoot:resolve(here,'../public')});
server.listen(port,'127.0.0.1',()=>console.log(`TrafficGen campaign test service listening at http://127.0.0.1:${port}`));
