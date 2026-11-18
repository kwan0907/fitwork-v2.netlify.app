import handler from '../functions/classes.mjs'
import { getDeployStore } from '@netlify/blobs'

export default (request, context) => handler(request, context, () => getDeployStore({
  name: 'bz-timetable-session', region: 'ap-southeast-1', consistency: 'strong'
}))

export const config = { path: '/api/classes', method: 'GET' }
