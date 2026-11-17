// Only DOM labels change. Language selection never reloads or touches a game core.
export const languages=[
 ['english','en','English'],['french','fr','Français'],['german','de','Deutsch'],
 ['italian','it','Italiano'],['spanish','es','Español'],['dutch','nl','Nederlands'],
 ['swedish','sv','Svenska'],['danish','da','Dansk'],['korean','ko','한국어'],
 ['chinese','zh-Hant','繁體中文'],['japanese','ja','日本語'],['russian','ru','Русский'],
 ['thai','th','ไทย'],['portuguese','pt-BR','Português (Brasil)'],['polish','pl','Polski'],
 ['turkish','tr','Türkçe'],['hungarian','hu','Magyar'],['ukrainian','uk','Українська'],
 ['czech','cs','Čeština'],['slovak','sk','Slovenčina'],['greek','el','Ελληνικά']
];
export const languageStorageKey='vrbrowsergames:language';
let english={},dictionary={},bySource=new Map(),templates=[],current='english',revision=0,doc;
const cache=new Map(),bindings=new Map(),attributeBindings=new Map(),staticText=[],staticAttributes=[];
let writes=0;
const tokens=value=>[...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
export function validDictionary(value,base){
 return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===Object.keys(base).length&&Object.entries(base).every(([key,source])=>typeof value[key]==='string'&&value[key].trim()&&tokens(value[key])===tokens(source));
}
export function message(source,values={}){return {source,values};}
export function translate(value){
 if(value&&typeof value==='object'&&typeof value.source==='string'){
  const key=bySource.get(value.source),pattern=dictionary[key]||value.source;
  return pattern.replace(/\{(\w+)\}/g,(token,name)=>Object.hasOwn(value.values,name)?(typeof value.values[name]==='object'?render(value.values[name]):String(value.values[name])):token);
 }
 const source=String(value??'');
 if(current==='english')return source;
 const trimmed=source.trim(),key=bySource.get(trimmed);
 if(key)return source.replace(trimmed,()=>dictionary[key]||trimmed);
 for(const template of templates){
  const match=template.pattern.exec(trimmed);if(!match)continue;
  const values=Object.fromEntries(template.names.map((name,i)=>[name,match[i+1]]));
  return source.replace(trimmed,()=>translate(message(template.source,values)));
 }
 // Browser exception names/details stay verbatim, while the recovery advice is translated.
 for(const [advice,id] of bySource)if(advice.endsWith('.')&&source.startsWith(advice+' ('))return (dictionary[id]||advice)+source.slice(advice.length);
 return source;
}
function render(value){return Array.isArray(value)?value.map(render).join(''):translate(value);}
function paint(node,binding){const value=render(binding.value);if(binding.attribute){if(node.getAttribute(binding.attribute)!==value)node.setAttribute(binding.attribute,value);}else if(node.textContent!==value)node.textContent=value;}
export function setText(node,value){
 if(++writes%128===0)for(const element of bindings.keys())if(!element.isConnected)bindings.delete(element);
 const binding={value};bindings.set(node,binding);paint(node,binding);
 return value;
}
export function appendText(node,value){return setText(node,[bindings.get(node)?.value??node.textContent,value]);}
export function setTranslatedAttribute(node,attribute,value){const binding={attribute,value};if(!attributeBindings.has(node))attributeBindings.set(node,new Map());attributeBindings.get(node).set(attribute,binding);paint(node,binding);}
function repaint(){
 for(const {node,source} of staticText)if(node.isConnected)node.nodeValue=translate(source);
 for(const {node,attribute,source} of staticAttributes)if(node.isConnected&&!attributeBindings.get(node)?.has(attribute))node.setAttribute(attribute,translate(source));
 for(const [node,binding]of bindings)if(node.isConnected)paint(node,binding);else bindings.delete(node);
 for(const [node,attributes]of attributeBindings)if(node.isConnected){for(const binding of attributes.values())paint(node,binding);}else attributeBindings.delete(node);
}
async function getDictionary(name){
 if(cache.has(name))return cache.get(name);
 const response=await fetch(new URL(`lang/${name}.json`,import.meta.url));
 if(!response.ok)throw Error('Language download failed');
 const value=await response.json();
 if(name!=='english'&&!validDictionary(value,english))throw Error('Incomplete language file');
 cache.set(name,value);return value;
}
export async function setLanguage(name,{persist=true}={}){
 const language=languages.find(item=>item[0]===name);if(!language)return false;
 const request=++revision,select=doc?.getElementById('language'),error=doc?.getElementById('language-error');
 if(error)error.hidden=true;
 try{
  const next=await getDictionary(name);if(request!==revision)return false;
  current=name;dictionary=next;if(doc)doc.documentElement.lang=language[1];if(select)select.value=name;
  if(persist)try{localStorage.setItem(languageStorageKey,name);}catch{}
  repaint();doc?.dispatchEvent(new Event('languagechange'));return true;
 }catch{
  if(request!==revision)return false;
  if(select)select.value=current;
  if(error){error.hidden=false;setText(error,'Could not load this language. Please try again.');}
  return false;
 }
}
export async function initI18n(document){
 doc=document;
 try{english=await getDictionary('english');}catch{english={};}
 dictionary=english;bySource=new Map(Object.entries(english).map(([key,value])=>[value,key]));
 // Only well-defined messages are inferred; player names and arbitrary game text remain data.
 templates=Object.values(english).filter(s=>s.includes('{')&&!['{status}','{name}','Stereo CPU','Game {'].some(prefix=>s.startsWith(prefix))).map(source=>{
  const names=[];let pattern='^',offset=0;
  for(const match of source.matchAll(/\{(\w+)\}/g)){pattern+=source.slice(offset,match.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([\\s\\S]*?)';names.push(match[1]);offset=match.index+match[0].length;}
  pattern+=source.slice(offset).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
  return {source,names,pattern:new RegExp(pattern)};
 });
 const select=doc.getElementById('language');
 for(const [name,tag,label]of languages){const option=doc.createElement('option');option.value=name;option.lang=tag;option.textContent=label;select.append(option);}
 const walker=doc.createTreeWalker(doc.body,4);let node;
 while((node=walker.nextNode())){
  if(node.parentElement.closest('script,style,pre,textarea,#language,.wordmark'))continue;
  if(bySource.has(node.nodeValue.trim()))staticText.push({node,source:node.nodeValue});
 }
 for(const node of doc.querySelectorAll('[aria-label],[alt],[title],meta[name="description"],meta[property="og:description"]')){
  for(const attribute of ['aria-label','alt','title','content']){const source=node.getAttribute(attribute);if(source&&bySource.has(source.trim()))staticAttributes.push({node,attribute,source});}
 }
 select.addEventListener('change',()=>void setLanguage(select.value));
 let saved;try{saved=localStorage.getItem(languageStorageKey);}catch{}
 if(saved&&languages.some(item=>item[0]===saved))await setLanguage(saved,{persist:false});
}
