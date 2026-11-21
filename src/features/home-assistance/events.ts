import { on } from "@/features/events/public";
import { randomUUID } from "node:crypto";

on("home.visit.updated",async(db,business,payload)=>{
  const action=String(payload.action??"");
  const message=action==="visit" ? "Nouvelle intervention à affecter."
    : action==="status" ? "Statut d’une intervention mis à jour."
    : action==="report" ? "Compte rendu d’intervention enregistré."
    : action==="validate" ? "Durée d’intervention validée."
    : "Intervention à domicile mise à jour.";
  await db.query("INSERT INTO notifications(id,restaurant_id,message) VALUES($1,$2,$3)",[randomUUID(),business,message]);
});
