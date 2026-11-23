"use client";
import { useState } from "react";
import Link from "next/link";
import "./onboarding.css";
type Result={headers:string[];sample:string[][];total:number;ready:number;skipped:number;issues:{line:number;reason:string}[];created:number};
export function CustomerImport({restaurant}:{restaurant:string}) {
  const [csv,setCsv]=useState("");
  const [filename,setFilename]=useState("");
  const [headers,setHeaders]=useState<string[]>([]);
  const [nameColumn,setNameColumn]=useState(0);
  const [contactColumn,setContactColumn]=useState(1);
  const [preview,setPreview]=useState<Result|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const endpoint="/api/restaurants/"+encodeURIComponent(restaurant)+"/import-clients";
  async function run(commit:boolean,source=csv,nc=nameColumn,cc=contactColumn) {
    setBusy(true);setError("");
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({csv:source,nameColumn:nc,contactColumn:cc,commit})});
      const body=await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Import impossible.");
      setHeaders(body.headers);setPreview(body);if(commit)setDone(true);
    } catch(cause){setError(cause instanceof Error ? cause.message:"Import impossible.");}
    finally{setBusy(false);}
  }
  async function load(file:File|undefined){
    if(!file)return;
    if(file.size>5_000_000){setError("Fichier limité à 5 Mo.");return;}
    const value=await file.text();
    setFilename(file.name);setCsv(value);setPreview(null);setDone(false);
    const line=value.replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]??"";
    const separator=(line.match(/;/g)?.length??0)>(line.match(/,/g)?.length??0)?";":",";
    const guessed=line.split(separator).map((item)=>item.trim().replace(/^"|"$/g,""));
    setHeaders(guessed);
    const name=guessed.findIndex((item)=>/nom|name/i.test(item));
    const contact=guessed.findIndex((item)=>/email|e-mail|mail|téléphone|telephone|phone|contact/i.test(item));
    const nc=name>=0?name:0,cc=contact>=0?contact:1;
    setNameColumn(nc);setContactColumn(cc);
    void run(false,value,nc,cc);
  }
  return <main className="access-shell"><div className="access-panel" style={{maxWidth:880,margin:"2rem auto"}}>
    <Link href={"/commerce/"+restaurant}>← Établissement</Link>
    <h1>Importer vos clients</h1><p>Importez des fiches propres à cet établissement. Aucun compte client, point de fidélité ou consentement marketing n’est créé.</p>
    <div className="onboarding-fields"><label>Fichier CSV (5 Mo et 5 000 clients maximum)<input type="file" accept=".csv,text/csv" onChange={(e)=>void load(e.target.files?.[0])}/></label>
      {csv&&<><p>{filename}</p><label>Colonne du nom<select value={nameColumn} onChange={(e)=>{setNameColumn(Number(e.target.value));setPreview(null);}}>{headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>
      <label>Colonne de l’e-mail ou du téléphone<select value={contactColumn} onChange={(e)=>{setContactColumn(Number(e.target.value));setPreview(null);}}>{headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>
      <button disabled={busy} onClick={()=>void run(false)}>Actualiser l’aperçu</button></>}
    </div>
    {preview&&<section className="onboarding-recap"><h2>{done?"Import terminé":"Aperçu avant import"}</h2>
      <p>{preview.total} lignes · {preview.ready} prêtes · {preview.skipped} ignorées{done?" · "+preview.created+" créées":""}</p>
      <div style={{overflowX:"auto"}}><table><thead><tr>{preview.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{preview.sample.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
      {preview.issues.length>0&&<details><summary>Voir les lignes ignorées</summary><ul>{preview.issues.map((issue)=><li key={issue.line}>Ligne {issue.line} : {issue.reason}</li>)}</ul></details>}
      {!done&&<button disabled={busy||preview.ready===0} onClick={()=>void run(true)}>Confirmer l’import de {preview.ready} fiches</button>}
    </section>}
    {error&&<p role="alert" className="onboarding-error">{error}</p>}
    {done&&<Link className="access-primary" href={"/dashboard?restaurant="+restaurant}>Ouvrir mon espace</Link>}
  </div></main>;
}
