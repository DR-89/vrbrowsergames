import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {languages,validDictionary} from '../dist/i18n.js';

test('every offered language has a complete catalog with intact interpolation tokens',async()=>{
 const base=JSON.parse(await readFile(new URL('../dist/lang/english.json',import.meta.url)));
 assert.equal(languages.length,21);assert.equal(new Set(languages.map(x=>x[0])).size,21);
 assert.equal(languages.find(x=>x[0]==='chinese')[1],'zh-Hant');
 assert.equal(languages.find(x=>x[0]==='portuguese')[1],'pt-BR');
 for(const [name]of languages){
  const value=JSON.parse(await readFile(new URL(`../dist/lang/${name}.json`,import.meta.url)));
  assert.ok(validDictionary(value,base),name);
 }
});

test('incomplete translations and damaged placeholders cannot replace the active language',()=>{
 const base={a:'Room {code}',b:'Play'};
 assert.equal(validDictionary({a:'Raum {code}',b:'Spielen'},base),true);
 for(const value of [{a:'Raum {code}'},{a:'Raum {name}',b:'Spielen'},{a:'Raum {code}',b:''},{a:12,b:'Play'},[]])assert.ok(!validDictionary(value,base));
});
