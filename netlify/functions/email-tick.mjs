import {getRuntime} from '../../src/runtime.js';
import {configuredDatabase} from '../../src/fly-civic-gateway.js';

export const config = {schedule: '@hourly'};

export default async () => {
  if(!configuredDatabase()){
    // This site is only a civic gateway in this mode; never run a second
    // email worker against Fly or start another database.
    console.log('Email tick skipped: Netlify database not configured.');
    return Response.json({skipped:true,reason:'database-not-configured'});
  }
  const {email} = await getRuntime();
  const result = await email.tick({batch:50,budgetMs:7000});
  console.log('Email tick',JSON.stringify(result));
  return Response.json(result);
};
