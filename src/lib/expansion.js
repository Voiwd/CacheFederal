export const EXPANSION_ROLES = [
  {id:'senator',label:'Senadores'}, {id:'president',label:'Presidente'},
  {id:'minister',label:'Ministros'}, {id:'governor',label:'Governadores'}, {id:'mayor',label:'Prefeitos'},
]
async function readExpansion(path,params,signal) {
  const response=await fetch(`/api/expansion/${path}?${new URLSearchParams(params)}`,{signal})
  const result=await response.json()
  if(!response.ok||result.error) throw new Error(result.error||'Fonte oficial indisponível.')
  return result
}
export function searchExpandedProfiles(filters={},options={}) {
  return readExpansion('search',Object.fromEntries(Object.entries(filters).filter(([,v])=>v!==undefined&&v!==null)),options.signal)
}
export function getExpandedCosts(profile,year,options={}) {
  return readExpansion('costs',{profile:JSON.stringify(profile),year},options.signal)
}
