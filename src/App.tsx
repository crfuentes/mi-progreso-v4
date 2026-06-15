import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { supabase } from "./supabase";

// ── Types ──────────────────────────────────────────────────────────────────
interface FoodOption { id:string; label:string; amount:string; excludesGroups?:string[]; }
interface Cat { id:string; label:string; single:boolean; max?:number; required?:boolean; excludesGroups?:string[]; options:FoodOption[]; }
interface MealDef { label:string; time:string; emoji:string; categories:Cat[]; }
type Plan = Record<string,MealDef>;
type SyncStatus = "loading"|"synced"|"syncing"|"offline"|"error";
interface Wellness { exercise:string[]; stretching:boolean; sleep:number; energy:number; mood:number; creatine:boolean; omega3:boolean; vitaminD:boolean; alcohol:{vino:number;cerveza:number;destilado:number;otro:number}; cigarettes:number; coffees:number; caffeinePills:number; musclePain:number; note:string; weight:number; }
interface GymSet { weight:number; reps:number; }
interface GymExercise { id:string; name:string; sets:GymSet[]; notes:string; }
interface GymSession { day:string; exercises:GymExercise[]; }
type GymSessions = Record<string, GymSession>;
type GymTemplate = Record<string, { label:string; exercises:{id:string;name:string}[]; }>;

// ── Colors ─────────────────────────────────────────────────────────────────
const G = {
  dark:"#0f2044", mid:"#1e56a0", accent:"#4cc9f0", light:"#dbeeff",
  muted:"#6b92bb", bg:"#f0f6ff", white:"#fff", text:"#0d1b2e",
  sub:"#4a6080", border:"#cce0f5", warm:"#f4a261", green:"#52b788",
  red:"#e76f51", purple:"#9b72cf",
};

// ── Meal Plan ──────────────────────────────────────────────────────────────
const DEFAULT_PLAN: Plan = {
  desayuno: { label:"Desayuno", time:"9:00", emoji:"☀️", categories:[
    {id:"lacteo",label:"Lácteo",single:true,required:true,options:[
      {id:"des_yogurt",label:"Yogurt descremado",amount:"1 unidad"},
      {id:"des_leche",label:"Leche descremada 200cc",amount:"200 cc"}
    ]},
    {id:"pan",label:"Pan / Carbohidrato",single:true,required:true,options:[
      {id:"des_panperfecto",label:"3 rbas. pan perfecto",amount:"3 rebanadas"},
      {id:"des_panintegral",label:"2 rbas. pan integral",amount:"2 rebanadas"},
      {id:"des_panpita",label:"1 pan pita integral",amount:"1 unidad"},
      {id:"des_hallulla",label:"½ hallulla",amount:"½ unidad"},
      {id:"des_panfrances",label:"1 diente pan francés",amount:"1 diente"},
      {id:"des_fajitas",label:"2 fajitas (M)",amount:"2 unidades medianas"}
    ]},
    {id:"proteina",label:"Proteína",single:true,required:true,options:[
      {id:"des_huevos4",label:"4 huevos (2 yemas)",amount:"4 unidades"},
      {id:"des_quesillo",label:"5 tajadas quesillo 150g",amount:"150 g"},
      {id:"des_jamon",label:"3 lám. jamón pavo/pollo",amount:"3 láminas"},
      {id:"des_pollo",label:"100g pollo cocido",amount:"100 g"},
      {id:"des_atun",label:"1 lata atún",amount:"1 lata"},
      {id:"des_huevos3",label:"3 huevos cocidos",amount:"3 unidades",excludesGroups:["grasa"]}
    ]},
    {id:"grasa",label:"Grasa saludable",single:true,required:true,options:[
      {id:"des_palta",label:"1 cda palta",amount:"1 cucharada sopera"},
      {id:"des_almendras",label:"6 almendras",amount:"6 unidades"},
      {id:"des_manies",label:"7 maníes s/sal",amount:"7 unidades"},
      {id:"des_mantmani",label:"1 cdta mantequilla maní",amount:"10 g"},
      {id:"des_chia",label:"10g chía",amount:"10 g"},
      {id:"des_nuez",label:"1 nuez",amount:"1 unidad"},
      {id:"des_linaza",label:"10g linaza",amount:"10 g"}
    ]}
  ]},
  colacion1: { label:"Colación", time:"11:00", emoji:"🍎", categories:[
    {id:"fruta",label:"Fruta",single:true,required:true,options:[
      {id:"c1_manzana",label:"1 manzana",amount:"1 unidad"},
      {id:"c1_pera",label:"1 pera",amount:"1 unidad"},
      {id:"c1_naranja",label:"1 naranja",amount:"1 unidad"},
      {id:"c1_platano",label:"½ plátano",amount:"½ unidad"},
      {id:"c1_kiwi",label:"2 kiwis",amount:"2 unidades"},
      {id:"c1_frutillas",label:"1 tz frutillas",amount:"200 cc"},
      {id:"c1_arandanos",label:"1 tz arándanos",amount:"200 cc"},
      {id:"c1_durazno",label:"1 durazno",amount:"1 unidad"},
      {id:"c1_mandarina",label:"2 mandarinas",amount:"2 unidades"},
      {id:"c1_cerezas",label:"15 cerezas",amount:"15 unidades"},
      {id:"c1_pina",label:"¾ tz piña",amount:"130 g"},
      {id:"c1_sandia",label:"1 tz sandía",amount:"200 g"},
      {id:"c1_melon",label:"1 tz melón",amount:"180 g"},
      {id:"c1_frambuesas",label:"1 tz frambuesas",amount:"200 cc"},
      {id:"c1_mora",label:"½ tz mora",amount:"100 cc"},
      {id:"c1_pepino",label:"1 pepino grande",amount:"1 unidad grande"}
    ]}
  ]},
  almuerzo: { label:"Almuerzo", time:"13:00–14:00", emoji:"🍽️", categories:[
    {id:"libre",label:"Ensalada libre (elige 2)",single:false,max:2,required:true,options:[
      {id:"al_achicoria",label:"Achicoria",amount:"1 taza"},
      {id:"al_apio",label:"Apio",amount:"1 taza"},
      {id:"al_espinaca_c",label:"Espinaca cruda",amount:"1 taza"},
      {id:"al_lechuga",label:"Lechuga",amount:"1 taza"},
      {id:"al_pepino",label:"Pepino",amount:"1 taza"},
      {id:"al_pimiento",label:"Pimiento morrón",amount:"1 taza"},
      {id:"al_repollo",label:"Repollo",amount:"1 taza"},
      {id:"al_zapallo_c",label:"Zapallo italiano",amount:"1 taza cruda"},
      {id:"al_acelga_c",label:"Acelga cruda",amount:"1 taza"}
    ]},
    {id:"general",label:"Ensalada general (elige 1)",single:true,required:true,options:[
      {id:"al_tomate",label:"1 tomate",amount:"1 unidad"},
      {id:"al_zanahoria_c",label:"½ tz zanahoria cruda",amount:"100 g"},
      {id:"al_cebolla",label:"¾ tz cebolla",amount:"150 g"},
      {id:"al_champinones",label:"1½ tz champiñones",amount:"300 g"},
      {id:"al_palmitos",label:"½ tz palmitos",amount:"100 g"},
      {id:"al_acelga",label:"½ tz acelga cocida",amount:"100 g"},
      {id:"al_alcachofa",label:"1 alcachofa chica",amount:"1 unidad chica"},
      {id:"al_betarraga",label:"½ tz betarraga",amount:"100 g"},
      {id:"al_brocoli",label:"1 tz brócoli",amount:"200 g"},
      {id:"al_coliflor",label:"1 tz coliflor",amount:"200 g"},
      {id:"al_esparragos",label:"5 espárragos",amount:"5 unidades"},
      {id:"al_porotosv",label:"¾ tz porotos verdes",amount:"150 g"},
      {id:"al_zanahoria",label:"1 tz zanahoria cocida",amount:"200 g"},
      {id:"al_zapallo",label:"1 tz zapallo italiano cocido",amount:"200 g"},
      {id:"al_camote",label:"½ tz zapallo camote",amount:"100 g"}
    ]},
    {id:"proteina",label:"Proteína",single:true,required:true,excludesGroups:["proteina_mixta","carbo_mixta","extra_mixta"],options:[
      {id:"al_pollo",label:"150g pollo",amount:"150 g"},
      {id:"al_carne",label:"150g carne magra",amount:"150 g"},
      {id:"al_atun",label:"1½ lata atún",amount:"1½ lata"},
      {id:"al_jurel",label:"3 trozos jurel 150g",amount:"150 g"},
      {id:"al_pavo",label:"150g pavo",amount:"150 g"},
      {id:"al_pescado",label:"150g salmón/pescado",amount:"150 g"}
    ]},
    {id:"carbo",label:"Carbohidrato",single:true,required:true,excludesGroups:["proteina_mixta","carbo_mixta","extra_mixta"],options:[
      {id:"al_arroz",label:"1 tz arroz cocido",amount:"150 g"},
      {id:"al_fideos",label:"1 tz fideos cocidos",amount:"150 g"},
      {id:"al_papas",label:"270g papas cocidas",amount:"270 g"},
      {id:"al_quinoa",label:"1 tz quínoa",amount:"150 g"},
      {id:"al_cuscus",label:"1 tz cus-cus",amount:"150 g"},
      {id:"al_fajitas",label:"3 fajitas (M)",amount:"3 unidades medianas"},
      {id:"al_pure",label:"210g puré de papas",amount:"210 g"},
      {id:"al_papashorno",label:"210g papas horneadas",amount:"210 g"}
    ]},
    {id:"proteina_mixta",label:"Preparación mixta — legumbre",single:true,required:false,excludesGroups:["proteina","carbo"],options:[
      {id:"alm_porotos",label:"1 tz porotos cocidos",amount:"150 g"},
      {id:"alm_lentejas",label:"1 tz lentejas cocidas",amount:"210 g"},
      {id:"alm_garbanzos",label:"1 tz garbanzos cocidos",amount:"150 g"},
      {id:"alm_arvejas",label:"1 tz arvejas cocidas",amount:"200 g"}
    ]},
    {id:"carbo_mixta",label:"Preparación mixta — cereal",single:true,required:false,excludesGroups:["proteina","carbo"],options:[
      {id:"alm_arrozmedio",label:"½ tz arroz cocido",amount:"70 g"},
      {id:"alm_fideosmedio",label:"½ tz fideos cocidos",amount:"70 g"}
    ]},
    {id:"extra_mixta",label:"Preparación mixta — proteína extra",single:true,required:false,excludesGroups:["proteina","carbo"],options:[
      {id:"alm_pollo50",label:"50g pollo",amount:"50 g"},
      {id:"alm_carne50",label:"50g carne magra",amount:"50 g"},
      {id:"alm_huevo1",label:"1 huevo cocido",amount:"1 unidad"}
    ]}
  ]},
  colacion2: { label:"Colación", time:"17:00", emoji:"🥛", categories:[
    {id:"lacteo",label:"Lácteo",single:true,required:true,options:[
      {id:"c2_yogurt",label:"Yogurt descremado",amount:"1 unidad"},
      {id:"c2_leche",label:"Leche descremada 200cc",amount:"200 cc"}
    ]},
    {id:"opciones",label:"Elige 2",single:false,max:2,required:true,options:[
      {id:"c2_avena",label:"20g avena",amount:"20 g (3 cdas)"},
      {id:"c2_manzana",label:"1 manzana",amount:"1 unidad"},
      {id:"c2_pera",label:"1 pera",amount:"1 unidad"},
      {id:"c2_naranja",label:"1 naranja",amount:"1 unidad"},
      {id:"c2_platano",label:"½ plátano",amount:"½ unidad"},
      {id:"c2_kiwi",label:"2 kiwis",amount:"2 unidades"},
      {id:"c2_frutillas",label:"1 tz frutillas",amount:"200 cc"},
      {id:"c2_arandanos",label:"1 tz arándanos",amount:"200 cc"},
      {id:"c2_durazno",label:"1 durazno",amount:"1 unidad"},
      {id:"c2_mandarina",label:"2 mandarinas",amount:"2 unidades"},
      {id:"c2_cerezas",label:"15 cerezas",amount:"15 unidades"},
      {id:"c2_pina",label:"¾ tz piña",amount:"130 g"},
      {id:"c2_sandia",label:"1 tz sandía",amount:"200 g"},
      {id:"c2_melon",label:"1 tz melón",amount:"180 g"},
      {id:"c2_frambuesas",label:"1 tz frambuesas",amount:"200 cc"},
      {id:"c2_mora",label:"½ tz mora",amount:"100 cc"},
      {id:"c2_pepino",label:"1 pepino",amount:"1 unidad"},
      {id:"c2_cereal",label:"20g cereal",amount:"20 g (3 cdas)"}
    ]}
  ]},
  cena: { label:"Cena", time:"20:00", emoji:"🌙", categories:[
    {id:"libre",label:"Ensalada libre (elige 2)",single:false,max:2,required:true,options:[
      {id:"ce_achicoria",label:"Achicoria",amount:"1 taza"},
      {id:"ce_apio",label:"Apio",amount:"1 taza"},
      {id:"ce_espinaca_c",label:"Espinaca cruda",amount:"1 taza"},
      {id:"ce_lechuga",label:"Lechuga",amount:"1 taza"},
      {id:"ce_pepino",label:"Pepino",amount:"1 taza"},
      {id:"ce_pimiento",label:"Pimiento morrón",amount:"1 taza"},
      {id:"ce_repollo",label:"Repollo",amount:"1 taza"},
      {id:"ce_zapallo_c",label:"Zapallo italiano",amount:"1 taza cruda"},
      {id:"ce_acelga_c",label:"Acelga cruda",amount:"1 taza"}
    ]},
    {id:"general",label:"Ensalada general (elige 1)",single:true,required:true,options:[
      {id:"ce_tomate",label:"1 tomate",amount:"1 unidad"},
      {id:"ce_zanahoria_c",label:"½ tz zanahoria cruda",amount:"100 g"},
      {id:"ce_cebolla",label:"¾ tz cebolla",amount:"150 g"},
      {id:"ce_champinones",label:"1½ tz champiñones",amount:"300 g"},
      {id:"ce_palmitos",label:"½ tz palmitos",amount:"100 g"},
      {id:"ce_acelga",label:"½ tz acelga cocida",amount:"100 g"},
      {id:"ce_alcachofa",label:"1 alcachofa chica",amount:"1 unidad chica"},
      {id:"ce_betarraga",label:"½ tz betarraga",amount:"100 g"},
      {id:"ce_brocoli",label:"1 tz brócoli",amount:"200 g"},
      {id:"ce_coliflor",label:"1 tz coliflor",amount:"200 g"},
      {id:"ce_esparragos",label:"5 espárragos",amount:"5 unidades"},
      {id:"ce_porotosv",label:"¾ tz porotos verdes",amount:"150 g"},
      {id:"ce_zanahoria",label:"1 tz zanahoria cocida",amount:"200 g"},
      {id:"ce_zapallo",label:"1 tz zapallo italiano cocido",amount:"200 g"}
    ]},
    {id:"proteina",label:"Proteína",single:true,required:true,options:[
      {id:"ce_pollo",label:"100g pollo",amount:"100 g"},
      {id:"ce_huevos3",label:"3 huevos cocidos",amount:"3 unidades"},
      {id:"ce_carne",label:"100g carne magra",amount:"100 g"},
      {id:"ce_atun",label:"1 lata atún",amount:"1 lata"},
      {id:"ce_jurel",label:"2 trozos jurel 100g",amount:"100 g"},
      {id:"ce_pavo",label:"100g pavo",amount:"100 g"},
      {id:"ce_pescado",label:"100g salmón/pescado",amount:"100 g"}
    ]},
    {id:"carbo",label:"Carbohidrato",single:true,required:true,options:[
      {id:"ce_arroz",label:"¾ tz arroz cocido",amount:"110 g"},
      {id:"ce_fideos",label:"¾ tz fideos cocidos",amount:"110 g"},
      {id:"ce_papas",label:"180g papas cocidas",amount:"180 g"},
      {id:"ce_quinoa",label:"¾ tz quínoa",amount:"110 g"},
      {id:"ce_cuscus",label:"¾ tz cus-cus",amount:"110 g"},
      {id:"ce_fajitas",label:"2 fajitas (M)",amount:"2 unidades medianas"},
      {id:"ce_pure",label:"140g puré de papas",amount:"140 g"},
      {id:"ce_papashorno",label:"140g papas horneadas",amount:"140 g"}
    ]}
  ]},
  colacion3: { label:"Colación", time:"22:00", emoji:"🌛", categories:[
    {id:"lacteo",label:"Lácteo",single:true,required:true,options:[
      {id:"c3_yogurt",label:"Yogurt descremado",amount:"1 unidad"},
      {id:"c3_leche",label:"Leche descremada 200cc",amount:"200 cc"}
    ]},
    {id:"opcion",label:"Elige 1",single:true,required:true,options:[
      {id:"c3_avena",label:"20g avena",amount:"20 g (3 cdas)"},
      {id:"c3_manzana",label:"1 manzana",amount:"1 unidad"},
      {id:"c3_pera",label:"1 pera",amount:"1 unidad"},
      {id:"c3_naranja",label:"1 naranja",amount:"1 unidad"},
      {id:"c3_platano",label:"½ plátano",amount:"½ unidad"},
      {id:"c3_kiwi",label:"2 kiwis",amount:"2 unidades"},
      {id:"c3_frutillas",label:"1 tz frutillas",amount:"200 cc"},
      {id:"c3_arandanos",label:"1 tz arándanos",amount:"200 cc"},
      {id:"c3_durazno",label:"1 durazno",amount:"1 unidad"},
      {id:"c3_mandarina",label:"2 mandarinas",amount:"2 unidades"},
      {id:"c3_cerezas",label:"15 cerezas",amount:"15 unidades"},
      {id:"c3_pina",label:"¾ tz piña",amount:"130 g"},
      {id:"c3_sandia",label:"1 tz sandía",amount:"200 g"},
      {id:"c3_melon",label:"1 tz melón",amount:"180 g"},
      {id:"c3_frambuesas",label:"1 tz frambuesas",amount:"200 cc"},
      {id:"c3_mora",label:"½ tz mora",amount:"100 cc"},
      {id:"c3_pepino",label:"1 pepino",amount:"1 unidad"},
      {id:"c3_cereal",label:"20g cereal",amount:"20 g (3 cdas)"}
    ]}
  ]},
  postEntreno: { label:"Post Entreno", time:"Tras entrenamiento", emoji:"💪", categories:[
    {id:"proteina",label:"Proteína + recuperación",single:false,required:false,options:[
      {id:"pe_scoop",label:"1 scoop proteína",amount:"1 scoop"},
      {id:"pe_leche",label:"200cc leche descremada",amount:"200 cc"},
      {id:"pe_creatina",label:"5g creatina",amount:"5 g"}
    ]}
  ]},
  postEntreno2: { label:"Post Entreno (2ª jornada)", time:"Tras segunda sesión", emoji:"🥤", categories:[
    {id:"recuperacion",label:"Recuperación adicional",single:false,required:false,options:[
      {id:"pe2_leche",label:"200cc leche descremada",amount:"200 cc"},
      {id:"pe2_platano",label:"1 plátano",amount:"1 unidad"}
    ]}
  ]}
};

const DEFAULT_GYM_TEMPLATE: GymTemplate = {
  main: { label:"Mi rutina", exercises:[{id:"m1",name:"Ejercicio 1"},{id:"m2",name:"Ejercicio 2"},{id:"m3",name:"Ejercicio 3"},{id:"m4",name:"Ejercicio 4"},{id:"m5",name:"Ejercicio 5"}] },
};

const MEAL_ORDER = ["desayuno","colacion1","almuerzo","colacion2","cena","colacion3","postEntreno","postEntreno2"];
const NOTIF_SCHEDULE = [
  {id:"desayuno",hour:9,label:"Desayuno",emoji:"☀️"},{id:"colacion1",hour:11,label:"Colación",emoji:"🍎"},
  {id:"almuerzo",hour:13,label:"Almuerzo",emoji:"🍽️"},{id:"colacion2",hour:17,label:"Colación de tarde",emoji:"🥛"},
  {id:"cena",hour:20,label:"Cena",emoji:"🌙"},{id:"colacion3",hour:22,label:"Colación nocturna",emoji:"🌛"},
];
const EVAL_INIT = [
  {id:1,date:"18/12/25",weight:90.3,fatPct:19.6,muscleKg:45.4,musOseo:3.5,endo:5.3,meso:6.6,ecto:0.4,sdd:6.6,brazo:5.8,muslo:0.8,pant:0.7},
  {id:2,date:"20/01/26",weight:87.6,fatPct:15.5,muscleKg:47.1,musOseo:3.7,endo:4.0,meso:6.6,ecto:0.7,sdd:3.3,brazo:5.9,muslo:1.1,pant:1.2},
  {id:3,date:"20/02/26",weight:84.8,fatPct:13.0,muscleKg:47.6,musOseo:3.7,endo:3.2,meso:6.6,ecto:1.0,sdd:1.4,brazo:6.1,muslo:1.3,pant:1.2},
  {id:4,date:"30/03/26",weight:84.6,fatPct:12.0,muscleKg:48.4,musOseo:3.7,endo:3.0,meso:6.6,ecto:1.0,sdd:0.9,brazo:6.1,muslo:1.3,pant:1.5},
];
const METAS = {fatPct:10.5,muscleKg:49.0,musOseo:4.0,endo:2.8,meso:6.7,ecto:1.2,brazo:6.3,muslo:1.5,pant:1.7};
const EXERCISE_OPTS = [{id:"padel",label:"Padel",emoji:"🎾"},{id:"gym",label:"Gym",emoji:"🏋️"},{id:"bici",label:"Bicicleta",emoji:"🚴"},{id:"otro",label:"Otro",emoji:"🏃"},{id:"descanso",label:"Descanso",emoji:"🛁"}];
const ENERGY_OPTS = [{v:1,e:"😴",l:"Sin energía"},{v:2,e:"😕",l:"Bajo"},{v:3,e:"😐",l:"Normal"},{v:4,e:"😄",l:"Bien"},{v:5,e:"⚡",l:"Excelente"}];
const MOOD_OPTS = [{v:1,e:"😞",l:"Mal"},{v:2,e:"😕",l:"Regular"},{v:3,e:"😐",l:"Neutro"},{v:4,e:"🙂",l:"Bien"},{v:5,e:"😄",l:"Genial"}];
const EMPTY_WELLNESS: Wellness = {exercise:[],stretching:false,sleep:0,energy:0,mood:0,creatine:false,omega3:false,vitaminD:false,alcohol:{vino:0,cerveza:0,destilado:0,otro:0},cigarettes:0,coffees:0,caffeinePills:0,musclePain:0,note:"",weight:0};
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WDAYS = ["D","L","M","M","J","V","S"];
const DAY_NAMES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const WATER_TARGET = 8;

// ── Helpers ────────────────────────────────────────────────────────────────
const lsGet = (k:string) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } };
const lsSet = (k:string,v:any) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const lsDel = (k:string) => { try { localStorage.removeItem(k); } catch {} };
const fmtDate = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const dayKey = (d:Date) => `meals:${fmtDate(d)}`;
const sameDay = (a:Date,b:Date) => fmtDate(a)===fmtDate(b);
const cap = (s:string) => s.charAt(0).toUpperCase()+s.slice(1);
const getWeekStart = (base:Date,offset:number) => { const d=new Date(base); d.setHours(0,0,0,0); const dow=d.getDay(); d.setDate(d.getDate()+(dow===0?-6:1-dow)+offset*7); return d; };
const avg = (arr:number[]) => arr.length?+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1):0;
const labelOf = (plan:Plan,mealId:string,catId:string,idOrLabel:string):string => { const cat=plan[mealId]?.categories.find(c=>c.id===catId); const opt=cat?.options.find(o=>o.id===idOrLabel); return opt?.label||idOrLabel; };
const labelsOf = (plan:Plan,mealId:string,catId:string,items:string[]):string[] => items.map(i=>labelOf(plan,mealId,catId,i));
const normalizeName = (s:string):string => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const levenshtein = (a:string,b:string):number => { if(a===b) return 0; if(!a.length) return b.length; if(!b.length) return a.length; let prev=Array.from({length:b.length+1},(_,i)=>i); for(let i=0;i<a.length;i++){ const curr=[i+1]; for(let j=0;j<b.length;j++){ curr.push(Math.min(prev[j+1]+1,curr[j]+1,prev[j]+(a[i]===b[j]?0:1))); } prev=curr; } return prev[b.length]; };
const mergeExerciseDuplicates = (sessions:GymSessions):{sessions:GymSessions,changed:boolean,canonical:Record<string,string>,merges:{from:string;to:string}[]} => {
  const stats:Record<string,{count:number,lastDate:string,normalized:string}>={};
  Object.entries(sessions).forEach(([date,session])=>{ session.exercises.forEach(ex=>{ if(!ex.name) return; const norm=normalizeName(ex.name); if(!stats[ex.name]) stats[ex.name]={count:0,lastDate:date,normalized:norm}; stats[ex.name].count++; if(date>stats[ex.name].lastDate) stats[ex.name].lastDate=date; }); });
  // Union-find por proximidad: mismo normalizado, o distancia Levenshtein <=1 con longitud >=4.
  const names=Object.keys(stats);
  const parent:Record<string,string>={};
  names.forEach(n=>{parent[n]=n;});
  const find=(x:string):string=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
  const union=(a:string,b:string)=>{ const ra=find(a),rb=find(b); if(ra!==rb) parent[ra]=rb; };
  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      const a=stats[names[i]].normalized, b=stats[names[j]].normalized;
      if(a===b){ union(names[i],names[j]); continue; }
      if(a.length>=4&&b.length>=4&&Math.abs(a.length-b.length)<=1&&levenshtein(a,b)<=1){ union(names[i],names[j]); }
    }
  }
  const groups:Record<string,string[]>={};
  names.forEach(n=>{ const root=find(n); if(!groups[root]) groups[root]=[]; groups[root].push(n); });
  const canonical:Record<string,string>={};
  const merges:{from:string;to:string}[]=[];
  let changed=false;
  Object.values(groups).forEach(variants=>{ if(variants.length<=1) return; const winner=variants.reduce((best,name)=>{ const a=stats[name],b=stats[best]; if(a.count>b.count) return name; if(a.count<b.count) return best; return a.lastDate>b.lastDate?name:best; },variants[0]); variants.forEach(v=>{ if(v!==winner){ canonical[v]=winner; merges.push({from:v,to:winner}); changed=true; } }); });
  if(!changed) return {sessions,changed:false,canonical,merges};
  const newSessions:GymSessions={};
  Object.entries(sessions).forEach(([date,session])=>{ newSessions[date]={...session,exercises:session.exercises.map(ex=>({...ex,name:canonical[ex.name]||ex.name}))}; });
  return {sessions:newSessions,changed:true,canonical,merges};
};
const applyCanonicalToTemplate = (template:GymTemplate,canonical:Record<string,string>):{template:GymTemplate,changed:boolean} => {
  let changed=false;
  const newTemplate:GymTemplate={};
  Object.entries(template).forEach(([key,day])=>{ newTemplate[key]={...day,exercises:day.exercises.map(ex=>{ const mapped=canonical[ex.name]; if(mapped&&mapped!==ex.name){ changed=true; return {...ex,name:mapped}; } return ex; })}; });
  return {template:changed?newTemplate:template,changed};
};
const migrateTemplateToSingleDay = (template:GymTemplate):{template:GymTemplate,changed:boolean} => {
  const keys=Object.keys(template);
  if(keys.length===1&&keys[0]==="main") return {template,changed:false};
  const allExercises:{id:string;name:string}[]=[];
  const seenNorms=new Set<string>();
  Object.values(template).forEach(day=>{ day.exercises.forEach(ex=>{ if(!ex.name) return; const norm=normalizeName(ex.name); if(!seenNorms.has(norm)){ seenNorms.add(norm); allExercises.push({id:ex.id,name:ex.name}); } }); });
  const label=template.main?.label||template.A?.label||"Mi rutina";
  return {template:{main:{label,exercises:allExercises.length>0?allExercises:DEFAULT_GYM_TEMPLATE.main.exercises}},changed:true};
};
const provider = new GoogleAuthProvider();

// ── Gemini API helpers ─────────────────────────────────────────────────────
const GEMINI_URL = (key:string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

const geminiTextOnly = (key:string, prompt:string) =>
  fetch(GEMINI_URL(key), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
  });

const geminiWithPDF = (key:string, base64:string, prompt:string) =>
  fetch(GEMINI_URL(key), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ contents:[{ parts:[
      { inline_data:{ mime_type:"application/pdf", data:base64 } },
      { text:prompt }
    ]}] })
  });

const geminiText = (data:any):string =>
  data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

// ──────────────────────────────────────────────────────────────────────────
const useWidth = () => { const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:430); useEffect(()=>{ const h=()=>setW(window.innerWidth); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]); return w; };

// ── Components ─────────────────────────────────────────────────────────────
const NBtn = ({onClick,children,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{background:"transparent",border:"none",cursor:disabled?"default":"pointer",color:disabled?"#ccc":G.mid,padding:"4px 14px",fontWeight:800,fontSize:26,lineHeight:1}}>{children}</button>;
const Chip = ({label,active,onClick,color}:any) => <button onClick={onClick} style={{border:active?`2px solid ${color||G.mid}`:`1.5px solid ${G.border}`,borderRadius:99,padding:"7px 14px",fontSize:14,fontWeight:active?700:400,background:active?G.light:G.white,color:active?G.dark:G.sub,cursor:"pointer",transition:"all 0.12s",whiteSpace:"nowrap" as const}}>{label}</button>;
const Bar = ({pct,color,height=7}:any) => <div style={{background:G.border,borderRadius:99,height,overflow:"hidden"}}><div style={{background:color,height:"100%",borderRadius:99,width:`${Math.min(pct,100)}%`,transition:"width 0.4s"}}/></div>;
const Card = ({children,style}:any) => <div style={{background:G.white,borderRadius:18,padding:"18px",boxShadow:"0 2px 12px rgba(14,32,68,0.07)",marginBottom:14,...style}}>{children}</div>;
const SLabel = ({children}:any) => <div style={{fontSize:12,fontWeight:700,color:G.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>{children}</div>;
const ExerciseNameInput = ({value,onChange,knownNames,placeholder}:{value:string;onChange:(v:string)=>void;knownNames:string[];placeholder?:string}) => {
  const [focused,setFocused]=useState(false);
  const [alertDup,setAlertDup]=useState<string|null>(null);
  const normalizedKnown=useMemo(()=>knownNames.map(n=>({original:n,normalized:normalizeName(n)})),[knownNames]);
  const valueNorm=normalizeName(value);
  const suggestions=focused&&value.trim().length>=2
    ? normalizedKnown.filter(n=>n.original!==value&&n.normalized!==valueNorm&&n.normalized.includes(valueNorm)).map(n=>n.original).slice(0,5)
    : [];
  const handleBlur=()=>{
    setTimeout(()=>setFocused(false),200);
    if(value.trim()&&knownNames.length>0){
      const exactMatch=normalizedKnown.find(n=>n.normalized===valueNorm&&n.original!==value);
      const closeMatch=!exactMatch?normalizedKnown.find(n=>n.original!==value&&valueNorm.length>=4&&levenshtein(n.normalized,valueNorm)<=1):null;
      const match=exactMatch||closeMatch;
      if(match) setAlertDup(match.original);
    }
  };
  return (
    <div style={{position:"relative" as const,flex:1}}>
      <input value={value} onChange={e=>{onChange(e.target.value); setAlertDup(null);}} onFocus={()=>{setFocused(true); setAlertDup(null);}} onBlur={handleBlur} placeholder={placeholder} style={{width:"100%",border:"none",borderBottom:`2px solid ${G.border}`,background:"transparent",fontSize:16,fontWeight:700,color:G.text,outline:"none",padding:"2px 0",boxSizing:"border-box" as const}}/>
      {suggestions.length>0&&<div style={{position:"absolute" as const,top:"100%",left:0,right:0,background:G.white,border:`1.5px solid ${G.border}`,borderRadius:9,marginTop:4,boxShadow:"0 4px 12px rgba(14,32,68,0.12)",zIndex:10,maxHeight:200,overflowY:"auto" as const}}>
        {suggestions.map(s=><div key={s} onMouseDown={e=>{e.preventDefault(); onChange(s); setFocused(false); setAlertDup(null);}} style={{padding:"9px 13px",fontSize:14,color:G.text,cursor:"pointer",borderBottom:`1px solid ${G.border}`}}>{s}</div>)}
      </div>}
      {alertDup&&<div style={{marginTop:7,padding:"8px 11px",background:"#fff8f0",border:`1.5px solid ${G.warm}`,borderRadius:9,fontSize:13,color:G.dark,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" as const}}>
        <span>¿Quisiste decir <b style={{color:G.warm}}>{alertDup}</b>?</span>
        <div style={{display:"flex",gap:6,marginLeft:"auto" as const}}>
          <button onMouseDown={e=>{e.preventDefault(); onChange(alertDup); setAlertDup(null);}} style={{padding:"5px 11px",background:G.warm,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sí</button>
          <button onMouseDown={e=>{e.preventDefault(); setAlertDup(null);}} style={{padding:"5px 11px",background:"transparent",border:`1.5px solid ${G.border}`,borderRadius:7,color:G.sub,fontSize:12,cursor:"pointer"}}>No</button>
        </div>
      </div>}
    </div>
  );
};
const SYNC_LABEL:Record<SyncStatus,string> = {loading:"Conectando...",synced:"☁️ Sincronizado",syncing:"⬆️ Guardando...",offline:"📴 Sin conexión",error:"⚠️ Error sync"};
const SYNC_COLOR:Record<SyncStatus,string> = {loading:"#aaa",synced:G.green,syncing:G.accent,offline:G.warm,error:G.red};

// ── PDF Export ─────────────────────────────────────────────────────────────
const exportWeekPDF = (weekData:any, weekStart:Date, plan:Plan) => {
  const DAY_FULL=["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const wsL=weekStart.toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"});
  const weL=new Date(weekStart.getTime()+6*86400000).toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric"});
  let rows="";
  Object.keys(weekData).forEach((dateStr,i)=>{ const mData=weekData[dateStr]; const done=mData?MEAL_ORDER.filter(id=>plan[id]?.categories.filter(c=>c.required!==false).every(c=>(mData[id]?.[c.id]||[]).length>0)).length:0; const pct=Math.round((done/MEAL_ORDER.length)*100); const d=new Date(dateStr+"T00:00:00"); let meals=""; if(mData) MEAL_ORDER.forEach(id=>{ const meal=plan[id]; if(!meal) return; const items=meal.categories.flatMap(c=>labelsOf(plan,id,c.id,mData[id]?.[c.id]||[])); if(items.length>0) meals+=`<div style="font-size:12px;margin:3px 0"><b style="color:#1e56a0">${meal.emoji} ${meal.label}:</b> ${items.join(", ")}</div>`; }); rows+=`<div style="border:1px solid #cce0f5;border-radius:10px;padding:14px;margin-bottom:12px;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b style="color:#0f2044;font-size:14px">${DAY_FULL[i]} ${d.getDate()}/${d.getMonth()+1}</b><span style="font-size:12px;color:#666">${done}/${MEAL_ORDER.length} comidas (${pct}%) · 💧${(mData?.water||0)*300}cc</span></div>${meals||'<i style="color:#bbb;font-size:12px">Sin registro</i>'}</div>`; });
  const html=`<!DOCTYPE html><html><head><title>Resumen Semanal</title><style>body{font-family:system-ui,sans-serif;padding:28px;max-width:720px;margin:0 auto;color:#0d1b2e}@media print{button{display:none}}</style></head><body><h2 style="color:#0f2044;margin-bottom:6px">Plan de Alimentación — Resumen Semanal</h2><p style="color:#666;margin-bottom:20px">${wsL} – ${weL}</p>${rows}<button onclick="window.print()" style="margin-top:18px;padding:11px 28px;background:#1e56a0;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:14px">🖨️ Imprimir / Guardar PDF</button></body></html>`;
  const w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); }
};

// ══════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════
export default function App() {
  const today=new Date(); const screenW=useWidth(); const isMobile=screenW<768;
  const maxW=isMobile?"100%":"540px"; const pad=isMobile?"14px 14px 0":"18px 18px 0";

  // ── Core state ──
  const [uid,setUid]=useState<string|null>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [syncStatus,setSyncStatus]=useState<SyncStatus>("loading");
  const [tab,setTab]=useState("day");
  const [calMonth,setCalMonth]=useState(new Date(today.getFullYear(),today.getMonth(),1));
  const [selected,setSelected]=useState(today);
  const [dayData,setDayData]=useState<any>({});
  const [expanded,setExpanded]=useState<string|null>(null);
  const [savedFlash,setSavedFlash]=useState(false);
  const [wellnessOpen,setWellnessOpen]=useState(false);
  const [streak,setStreak]=useState(0);
  const [notifBanner,setNotifBanner]=useState<{label:string;emoji:string}|null>(null);
  const [mergeNotice,setMergeNotice]=useState<{merges:{from:string;to:string}[]}|null>(null);
  const notifiedRef=useRef<Set<string>>(new Set());
  const dayUnsubRef=useRef<(()=>void)|null>(null);

  // ── Week state ──
  const [weekOffset,setWeekOffset]=useState(0);
  const [weekData,setWeekData]=useState<any>({});

  // ── Gym state ──
  const [gymTemplate,setGymTemplate]=useState<GymTemplate>(()=>lsGet("gym:template")||DEFAULT_GYM_TEMPLATE);
  const [gymSessions,setGymSessions]=useState<GymSessions>(()=>lsGet("gym:sessions")||{});
  const [gymDate,setGymDate]=useState(today);
  const [gymSession,setGymSession]=useState<GymSession|null>(null);
  const [lastGymSession,setLastGymSession]=useState<GymSession|null>(null);
  const [gymSelectedEx,setGymSelectedEx]=useState("");
  const [gymSaved,setGymSaved]=useState(false);
  const [timerSeconds,setTimerSeconds]=useState(0);
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerPreset,setTimerPreset]=useState(0);
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Progress state ──
  const [evals,setEvals]=useState<any[]>(()=>lsGet("progress:evals")||EVAL_INIT);
  const [showAddEval,setShowAddEval]=useState(false);
  const [evalPdfLoading,setEvalPdfLoading]=useState(false);
  const [evalPdfError,setEvalPdfError]=useState("");
  const evalFileRef=useRef<HTMLInputElement>(null);
  const [activeChart,setActiveChart]=useState("body");
  const [newEval,setNewEval]=useState<any>({date:"",weight:"",fatPct:"",muscleKg:"",musOseo:"",endo:"",meso:"",ecto:"",sdd:"",brazo:"",muslo:"",pant:""});
  const [aiAnalysis,setAiAnalysis]=useState("");
  const [aiLoading,setAiLoading]=useState(false);

  // ── Settings state ──
  const [apiKey,setApiKey]=useState<string>(()=>lsGet("gemini-api-key")||"");
  const [apiKeyInput,setApiKeyInput]=useState<string>(()=>lsGet("gemini-api-key")||"");
  const [notifEnabled]=useState<boolean>(()=>lsGet("notif-enabled")||false);
  const [mealPlan,setMealPlan]=useState<Plan>(()=>lsGet("custom-meal-plan")||DEFAULT_PLAN);
  const [pdfLoading,setPdfLoading]=useState(false);
  const [pdfPreview,setPdfPreview]=useState<Plan|null>(null);
  const [pdfError,setPdfError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  // ── Supabase storage state ──
  const [controlUrl,setControlUrl]=useState<string|null>(null);
  const [pautaUrl,setPautaUrl]=useState<string|null>(null);
  const [uploadingControl,setUploadingControl]=useState(false);
  const [uploadingPauta,setUploadingPauta]=useState(false);

  // ── Auth ──
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,user=>{
      if(user){ setUid(user.uid); setSyncStatus("synced"); }
      else { setUid(null); setSyncStatus("loading"); }
      setAuthLoading(false);
    });
    return ()=>unsub();
  },[]);

  const handleLogin=async()=>{
    try { await signInWithPopup(auth,provider); }
    catch(e:any){ if(e.code!=="auth/popup-closed-by-user") alert("Error al iniciar sesión. Intenta de nuevo."); }
  };
  const handleLogout=async()=>{
    if(!confirm("¿Cerrar sesión?")) return;
    await signOut(auth); setUid(null);
    setDayData({}); setEvals(EVAL_INIT); setGymSessions({}); setGymTemplate(DEFAULT_GYM_TEMPLATE); setMealPlan(DEFAULT_PLAN);
    setControlUrl(null); setPautaUrl(null);
  };

  // ── Load from Firebase ──
  useEffect(()=>{
    if(!uid) return;
    getDoc(doc(db,`users/${uid}/settings/evals`)).then(snap=>{ if(snap.exists()){ const d=snap.data().data; setEvals(d); lsSet("progress:evals",d); } }).catch(()=>{});
    getDoc(doc(db,`users/${uid}/settings/plan`)).then(snap=>{ if(snap.exists()){ const d=snap.data().data; setMealPlan(d); lsSet("custom-meal-plan",d); } }).catch(()=>{});
    // Cargar template y sesiones juntos para migración coherente
    Promise.all([
      getDoc(doc(db,`users/${uid}/settings/gymTemplates`)).catch(()=>null),
      getDoc(doc(db,`users/${uid}/settings/gymSessions`)).catch(()=>null),
    ]).then(([tmplSnap,sessSnap])=>{
      // Template
      let template:GymTemplate=DEFAULT_GYM_TEMPLATE;
      let templateChanged=false;
      if(tmplSnap&&tmplSnap.exists()){
        const raw=tmplSnap.data().data;
        const corrupt=raw&&Object.values(raw).some((day:any)=>Array.isArray(day?.exercises)&&day.exercises.length>10);
        if(corrupt){ template=DEFAULT_GYM_TEMPLATE; templateChanged=true; }
        else { template=raw; }
      }
      // Migrar template a un único día "main"
      const tmplMig=migrateTemplateToSingleDay(template);
      if(tmplMig.changed){ template=tmplMig.template; templateChanged=true; }
      // Sesiones
      let sessions:GymSessions={};
      let sessionsChanged=false;
      let merges:{from:string;to:string}[]=[];
      let canonical:Record<string,string>={};
      if(sessSnap&&sessSnap.exists()){
        sessions=sessSnap.data().data||{};
        const merged=mergeExerciseDuplicates(sessions);
        if(merged.changed){ sessions=merged.sessions; sessionsChanged=true; merges=merged.merges; canonical=merged.canonical; }
      }
      // Propagar canonical al template
      if(Object.keys(canonical).length>0){
        const tmplApply=applyCanonicalToTemplate(template,canonical);
        if(tmplApply.changed){ template=tmplApply.template; templateChanged=true; }
      }
      // Persistir
      setGymTemplate(template); lsSet("gym:template",template);
      setGymSessions(sessions); lsSet("gym:sessions",sessions);
      if(templateChanged) setDoc(doc(db,`users/${uid}/settings/gymTemplates`),{data:template}).catch(()=>{});
      if(sessionsChanged) setDoc(doc(db,`users/${uid}/settings/gymSessions`),{data:sessions}).catch(()=>{});
      // Mostrar toast informativo si hubo fusiones
      if(merges.length>0){ setMergeNotice({merges}); setTimeout(()=>setMergeNotice(null),12000); }
    });
  },[uid]);

  // ── Load Supabase files ──
  useEffect(()=>{
    if(!uid) return;
    const loadFiles=async()=>{
      const { data }=await supabase.storage.from("nutricion-docs").list(uid,{sortBy:{column:"created_at",order:"desc"}});
      if(!data) return;
      const lastControl=data.find(f=>f.name.includes("_control."));
      const lastPauta=data.find(f=>f.name.includes("_pauta."));
      if(lastControl){ const { data:u }=supabase.storage.from("nutricion-docs").getPublicUrl(`${uid}/${lastControl.name}`); setControlUrl(u.publicUrl); }
      if(lastPauta){ const { data:u }=supabase.storage.from("nutricion-docs").getPublicUrl(`${uid}/${lastPauta.name}`); setPautaUrl(u.publicUrl); }
    };
    loadFiles();
  },[uid]);

  // ── Day listener ──
  useEffect(()=>{
    if(dayUnsubRef.current){ dayUnsubRef.current(); dayUnsubRef.current=null; }
    setDayData(lsGet(dayKey(selected))||{}); setExpanded(null); setWellnessOpen(false);
    if(!uid) return;
    const ref=doc(db,`users/${uid}/days/${fmtDate(selected)}`);
    const unsub=onSnapshot(ref,snap=>{ if(snap.exists()){ const d=snap.data(); setDayData(d); lsSet(dayKey(selected),d); } },()=>setSyncStatus("offline"));
    dayUnsubRef.current=unsub;
    return ()=>{ if(dayUnsubRef.current) dayUnsubRef.current(); };
  },[selected,uid]);

  // ── Streak ──
  const computeStreak=useCallback((plan:Plan)=>{ let s=0; const d=new Date(today); while(true){ const data=lsGet(dayKey(d)); if(!data) break; const ok=MEAL_ORDER.every(id=>plan[id]?.categories.filter(c=>c.required!==false).every(c=>(data[id]?.[c.id]||[]).length>0)); if(!ok) break; s++; d.setDate(d.getDate()-1); } return s; },[]);
  useEffect(()=>{ setStreak(computeStreak(mealPlan)); },[dayData,mealPlan]);

  // ── Timer ──
  useEffect(()=>{
    if(timerRunning&&timerSeconds>0){
      timerRef.current=setInterval(()=>setTimerSeconds(s=>{ if(s<=1){ setTimerRunning(false); clearInterval(timerRef.current!); playBeep(); return 0; } return s-1; }),1000);
    }
    return ()=>{ if(timerRef.current) clearInterval(timerRef.current); };
  },[timerRunning]);

  const playBeep=()=>{ try{ const ctx=new AudioContext(); [0,300,600].forEach(delay=>{ const o=ctx.createOscillator(); const g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=880; g.gain.setValueAtTime(0.3,ctx.currentTime+delay/1000); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay/1000+0.3); o.start(ctx.currentTime+delay/1000); o.stop(ctx.currentTime+delay/1000+0.3); }); }catch{} };
  const startTimer=(secs:number)=>{ if(timerRef.current) clearInterval(timerRef.current); setTimerPreset(secs); setTimerSeconds(secs); setTimerRunning(true); };
  const resetTimer=()=>{ if(timerRef.current) clearInterval(timerRef.current); setTimerRunning(false); setTimerSeconds(timerPreset); };
  const toggleTimer=()=>{ if(timerRunning){ if(timerRef.current) clearInterval(timerRef.current); setTimerRunning(false); } else if(timerSeconds>0) setTimerRunning(true); };
  const fmtTimer=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const timerDone=timerPreset>0&&timerSeconds===0&&!timerRunning;
  const timerPct=timerPreset>0?(timerSeconds/timerPreset)*100:0;

  useEffect(()=>{
    if(tab!=="week") return;
    const ws=getWeekStart(today,weekOffset); const result:any={};
    for(let i=0;i<7;i++){ const d=new Date(ws.getTime()+i*86400000); result[fmtDate(d)]=lsGet(dayKey(d)); }
    setWeekData(result);
    Promise.all(Object.keys(result).map(async dateStr=>{ try{ const snap=await getDoc(doc(db,`users/${uid}/days/${dateStr}`)); if(snap.exists()) result[dateStr]=snap.data(); }catch{} })).then(()=>setWeekData({...result}));
  },[tab,weekOffset]);

  // ── Gym session loader ──
  useEffect(()=>{
    const dateStr=fmtDate(gymDate);
    const existing=gymSessions[dateStr];
    if(existing){ setGymSession(existing); }
    else { const tmpl=gymTemplate.main||DEFAULT_GYM_TEMPLATE.main; setGymSession({ day:"main", exercises:tmpl.exercises.map(ex=>({id:ex.id,name:ex.name,sets:[{weight:0,reps:0}],notes:""})) }); }
    const prev=Object.entries(gymSessions).filter(([d])=>d<dateStr).sort(([a],[b])=>b.localeCompare(a))[0];
    setLastGymSession(prev?prev[1]:null);
  },[gymDate,gymSessions,gymTemplate]);

  // ── Notifications ──
  useEffect(()=>{
    if(!notifEnabled) return;
    const checkNotifs=()=>{ const now=new Date(); const h=now.getHours(),m=now.getMinutes(); NOTIF_SCHEDULE.forEach(ns=>{ const key=`${fmtDate(now)}-${ns.id}`; const minsSince=(h-ns.hour)*60+m; if(minsSince>=0&&minsSince<30&&!notifiedRef.current.has(key)){ notifiedRef.current.add(key); setNotifBanner({label:ns.label,emoji:ns.emoji}); setTimeout(()=>setNotifBanner(null),30000); } }); };
    checkNotifs(); const interval=setInterval(checkNotifs,60000); return ()=>clearInterval(interval);
  },[notifEnabled]);

  // ── Persist ──
  const persist=async(nd:any)=>{ lsSet(dayKey(selected),nd); if(!uid) return; setSyncStatus("syncing"); try { await setDoc(doc(db,`users/${uid}/days/${fmtDate(selected)}`),nd); setSyncStatus("synced"); } catch { setSyncStatus("error"); } };
  const syncEvals=async(ne:any[])=>{ lsSet("progress:evals",ne); if(!uid) return; try{ await setDoc(doc(db,`users/${uid}/settings/evals`),{data:ne}); }catch{} };
  const syncPlan=async(plan:Plan)=>{ lsSet("custom-meal-plan",plan); if(!uid) return; try{ await setDoc(doc(db,`users/${uid}/settings/plan`),{data:plan}); }catch{} };

  const handleSave=async()=>{ await persist(dayData); setSavedFlash(true); setTimeout(()=>setSavedFlash(false),2000); };
  const toggleOption=(mealId:string,catId:string,opt:string,single:boolean,max?:number)=>{ const nd=JSON.parse(JSON.stringify(dayData)); if(!nd[mealId]) nd[mealId]={}; const cur=nd[mealId][catId]||[]; let next; if(cur.includes(opt)) next=cur.filter((o:string)=>o!==opt); else if(single) next=[opt]; else if(max&&cur.length>=max) next=[...cur.slice(1),opt]; else next=[...cur,opt]; nd[mealId][catId]=next; setDayData(nd); persist(nd); };
  const updateNote=(mealId:string,note:string)=>{ const nd=JSON.parse(JSON.stringify(dayData)); if(!nd[mealId]) nd[mealId]={}; nd[mealId].notes=note; setDayData(nd); persist(nd); };
  const setWater=(g:number)=>{ const nd={...dayData,water:g}; setDayData(nd); persist(nd); };
  const clearDay=()=>{ setDayData({}); lsDel(dayKey(selected)); setDoc(doc(db,`users/${uid}/days/${fmtDate(selected)}`),{}); };
  const getWellness=():Wellness=>{ const saved=dayData.wellness||{}; const exercise=Array.isArray(saved.exercise)?saved.exercise:(saved.exercise?[saved.exercise]:[]); const alcoholRaw=saved.alcohol; const alcohol=typeof alcoholRaw==="object"&&alcoholRaw!==null?{...EMPTY_WELLNESS.alcohol,...alcoholRaw}:(typeof alcoholRaw==="number"&&alcoholRaw>0?{...EMPTY_WELLNESS.alcohol,otro:alcoholRaw}:EMPTY_WELLNESS.alcohol); return {...EMPTY_WELLNESS,...saved,exercise,alcohol}; };
  const setWellness=(wl:Partial<Wellness>)=>{ const nd={...dayData,wellness:{...getWellness(),...wl}}; setDayData(nd); persist(nd); };

  // ── Gym handlers ──
  const saveGymSession=async()=>{ if(!gymSession) return; const dateStr=fmtDate(gymDate); const updated={...gymSessions,[dateStr]:gymSession}; setGymSessions(updated); lsSet("gym:sessions",updated); setSyncStatus("syncing"); try { await setDoc(doc(db,`users/${uid}/settings/gymSessions`),{data:updated}); setSyncStatus("synced"); setGymSaved(true); setTimeout(()=>setGymSaved(false),2000); } catch { setSyncStatus("error"); } };
  const saveGymTemplate=async(tmpl:GymTemplate)=>{ setGymTemplate(tmpl); lsSet("gym:template",tmpl); try{ await setDoc(doc(db,`users/${uid}/settings/gymTemplates`),{data:tmpl}); }catch{} };
  const updateGymExName=(exIdx:number,name:string)=>{ if(!gymSession) return; const ex=[...gymSession.exercises]; ex[exIdx]={...ex[exIdx],name}; setGymSession({...gymSession,exercises:ex}); };
  const updateGymExNotes=(exIdx:number,notes:string)=>{ if(!gymSession) return; const ex=[...gymSession.exercises]; ex[exIdx]={...ex[exIdx],notes}; setGymSession({...gymSession,exercises:ex}); };
  const updateSet=(exIdx:number,setIdx:number,field:keyof GymSet,val:number)=>{ if(!gymSession) return; const ex=gymSession.exercises.map((e,i)=>i!==exIdx?e:{...e,sets:e.sets.map((s,j)=>j!==setIdx?s:{...s,[field]:val})}); setGymSession({...gymSession,exercises:ex}); };
  const addSet=(exIdx:number)=>{ if(!gymSession) return; const last=gymSession.exercises[exIdx].sets.slice(-1)[0]||{weight:0,reps:0}; const ex=gymSession.exercises.map((e,i)=>i!==exIdx?e:{...e,sets:[...e.sets,{...last}]}); setGymSession({...gymSession,exercises:ex}); };
  const removeSet=(exIdx:number,setIdx:number)=>{ if(!gymSession||gymSession.exercises[exIdx].sets.length<=1) return; const ex=gymSession.exercises.map((e,i)=>i!==exIdx?e:{...e,sets:e.sets.filter((_,j)=>j!==setIdx)}); setGymSession({...gymSession,exercises:ex}); };
  const addExercise=()=>{ if(!gymSession) return; const id=`ex${Date.now()}`; const newEx={id,name:"Nuevo ejercicio",sets:[{weight:0,reps:0}],notes:""}; setGymSession({...gymSession,exercises:[...gymSession.exercises,newEx]}); };
  const removeExercise=(exIdx:number)=>{ if(!gymSession||gymSession.exercises.length<=1) return; setGymSession({...gymSession,exercises:gymSession.exercises.filter((_,i)=>i!==exIdx)}); };

  // ── PDF upload — Plan alimentación (Gemini) ──
  const handlePDFUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file||!apiKey){setPdfError("Ingresa tu API Key primero."); return;} setPdfLoading(true); setPdfError(""); setPdfPreview(null); if(fileRef.current) fileRef.current.value=""; try { const toB64=(f:File):Promise<string>=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=ev=>res((ev.target?.result as string).split(",")[1]); r.onerror=rej; r.readAsDataURL(f); }); const base64=await toB64(file); const resp=await geminiWithPDF(apiKey,base64,`Analiza este plan de alimentación. Devuelve ÚNICAMENTE JSON válido sin texto ni backticks con claves: desayuno, colacion1, almuerzo, colacion2, cena, colacion3, postEntreno, postEntreno2. Cada comida tiene esta estructura exacta: {label, time, emoji, categories:[{id, label, single, max?, required?, excludesGroups?, options:[{id, label, amount, excludesGroups?}]}]}. Reglas:\n- 'id' de cada categoría y opción debe ser único, en snake_case, con prefijo de la comida (ej: 'des_yogurt' para desayuno yogurt)\n- 'amount' debe ser la cantidad en lenguaje natural con unidad explícita (gramos, cc, ml, unidad, taza, cdta, cda). Ejemplo: '200 cc', '3 rebanadas', '1 unidad', '10 g'\n- 'single:true' cuando se elige UNA opción del grupo, 'single:false, max:N' cuando se eligen hasta N\n- 'required:false' para categorías opcionales (post entreno 2ª jornada)\n- 'excludesGroups' es un array de IDs de categorías que se desactivan al elegir esta opción/categoría (ej: '3 huevos' excluye al grupo 'grasa')\nExtrae fielmente las opciones y cantidades del PDF.`); const data=await resp.json(); const text=geminiText(data); try { const parsed=JSON.parse(text.replace(/```json|```/g,"").trim()); if(!parsed.desayuno||!parsed.almuerzo) throw new Error(); setPdfPreview(parsed); } catch { setPdfError("No se pudo interpretar el plan."); } } catch(err:any){ setPdfError(`Error: ${err.message||"Verifica tu API Key."}`); } setPdfLoading(false); };
  const applyNewPlan=async()=>{ if(!pdfPreview) return; setMealPlan(pdfPreview); await syncPlan(pdfPreview); setPdfPreview(null); alert("✅ Plan actualizado!"); };

  // ── Eval PDF (Gemini) ──
  const handleEvalPDFUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file||!apiKey){setEvalPdfError("Configura tu API Key primero."); return;} setEvalPdfLoading(true); setEvalPdfError(""); if(evalFileRef.current) evalFileRef.current.value=""; try { const toB64=(f:File):Promise<string>=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=ev=>res((ev.target?.result as string).split(",")[1]); r.onerror=rej; r.readAsDataURL(f); }); const base64=await toB64(file); const resp=await geminiWithPDF(apiKey,base64,`Analiza este informe de evaluación antropométrica y extrae los datos. Devuelve ÚNICAMENTE JSON válido sin texto ni backticks con esta estructura exacta:\n{"date":"DD/MM/AA","weight":0,"fatPct":0,"muscleKg":0,"musOseo":0,"endo":0,"meso":0,"ecto":0,"sdd":0,"brazo":0,"muslo":0,"pant":0}\nExtrae los valores numéricos exactos del informe. Si algún valor no aparece, usa 0.`); const data=await resp.json(); const text=geminiText(data); try { const parsed=JSON.parse(text.replace(/```json|```/g,"").trim()); if(!parsed.date||!parsed.fatPct) throw new Error(); setNewEval({date:parsed.date,weight:parsed.weight||"",fatPct:parsed.fatPct||"",muscleKg:parsed.muscleKg||"",musOseo:parsed.musOseo||"",endo:parsed.endo||"",meso:parsed.meso||"",ecto:parsed.ecto||"",sdd:parsed.sdd||"",brazo:parsed.brazo||"",muslo:parsed.muslo||"",pant:parsed.pant||""}); setEvalPdfError(""); } catch { setEvalPdfError("No se pudo extraer los datos. Verifica que sea un informe antropométrico."); } } catch(err:any){ setEvalPdfError(`Error: ${err.message||"Verifica tu API Key y conexión."}`); } setEvalPdfLoading(false); };

  // ── AI Analysis (Gemini) ──
  const runAiAnalysis=async()=>{ if(!apiKey){alert("Configura tu API Key primero.");return;} setAiLoading(true); setAiAnalysis(""); const ws=getWeekStart(today,weekOffset); const wDays:any[]=[]; for(let i=0;i<7;i++){ const d=new Date(ws.getTime()+i*86400000); const dayD=weekData[fmtDate(d)]; if(dayD){ const wl=dayD.wellness||{}; const exArr=Array.isArray(wl.exercise)?wl.exercise:(wl.exercise?[wl.exercise]:[]); const gym=gymSessions[fmtDate(d)]; const alcRaw=wl.alcohol; const alcObj=typeof alcRaw==="object"&&alcRaw!==null?alcRaw:(typeof alcRaw==="number"&&alcRaw>0?{otro:alcRaw}:{}); const alcTotal=(alcObj.vino||0)+(alcObj.cerveza||0)+(alcObj.destilado||0)+(alcObj.otro||0); wDays.push({fecha:fmtDate(d),adherencia:`${Math.round(MEAL_ORDER.filter(id=>mealPlan[id]?.categories.filter(c=>c.required!==false).every(c=>(dayD[id]?.[c.id]||[]).length>0)).length/MEAL_ORDER.length*100)}%`,agua:`${(dayD.water||0)*300}cc`,ejercicio:exArr.join(", ")||"no registrado",gym:gym?`Gym — ${gym.exercises.map(e=>`${e.name}: ${e.sets.map(s=>`${s.weight}kg×${s.reps}`).join(", ")}`).join(" | ")}`:null,sueño:`${wl.sleep||0}h`,energia:`${wl.energy||0}/5`,animo:`${wl.mood||0}/5`,dolor:`${["Sin dolor","Leve","Moderado","Fuerte","Muy fuerte"][wl.musclePain||0]}`,cafes:wl.coffees||0,cafeina:wl.caffeinePills||0,alcohol:alcTotal>0?`${alcTotal} total (vino:${alcObj.vino||0} copa150ml, cerveza:${alcObj.cerveza||0} vaso330ml, destilado:${alcObj.destilado||0} trago45ml, otro:${alcObj.otro||0})`:"0",cigarrillos:wl.cigarettes||0}); } } try { const prompt=`Eres un coach de bienestar, nutrición y entrenamiento. Analiza los datos de esta semana y dame un análisis breve (máximo 6 puntos) con observaciones concretas y 2-3 recomendaciones prácticas. Sé directo y motivador.\n\nDatos:\n${JSON.stringify(wDays,null,2)}\n\nMétricas actuales: Grasa ${evals[evals.length-1]?.fatPct}% (meta 10.5%), Músculo ${evals[evals.length-1]?.muscleKg}kg (meta 49kg).`; const aiResp=await geminiTextOnly(apiKey,prompt); const aiJson=await aiResp.json(); if(aiJson.error){ setAiAnalysis(`⚠️ Error Gemini: ${aiJson.error.message||"API Key inválida o sin cuota."}`); } else { const txt=geminiText(aiJson); setAiAnalysis(txt||"La IA no devolvió texto. Revisa tu API Key en Config."); } } catch(err:any){ setAiAnalysis(`Error al conectar con Gemini: ${err.message||"Sin conexión."}`); } setAiLoading(false); };

  // ── Supabase file upload ──
  const handleSupabaseUpload=async(e:React.ChangeEvent<HTMLInputElement>,tipo:"control"|"pauta")=>{ const file=e.target.files?.[0]; if(!file||!uid) return; const setUploading=tipo==="control"?setUploadingControl:setUploadingPauta; try { setUploading(true); const fileExt=file.name.split(".").pop(); const fileName=`${uid}/${Date.now()}_${tipo}.${fileExt}`; const { error:uploadError }=await supabase.storage.from("nutricion-docs").upload(fileName,file); if(uploadError) throw uploadError; const { data }=supabase.storage.from("nutricion-docs").getPublicUrl(fileName); if(tipo==="control") setControlUrl(data.publicUrl); else setPautaUrl(data.publicUrl); alert("¡Archivo subido con éxito!"); } catch(err:any){ alert("Error al subir: "+(err.message||"Verifica las políticas de Supabase")); } finally { setUploading(false); } };

  const addEval=async()=>{ const ev={id:Date.now(),date:newEval.date,weight:+newEval.weight||0,fatPct:+newEval.fatPct||0,muscleKg:+newEval.muscleKg||0,musOseo:+newEval.musOseo||0,endo:+newEval.endo||0,meso:+newEval.meso||0,ecto:+newEval.ecto||0,sdd:+newEval.sdd||0,brazo:+newEval.brazo||0,muslo:+newEval.muslo||0,pant:+newEval.pant||0}; const ne=[...evals,ev]; setEvals(ne); await syncEvals(ne); setShowAddEval(false); setNewEval({date:"",weight:"",fatPct:"",muscleKg:"",musOseo:"",endo:"",meso:"",ecto:"",sdd:"",brazo:"",muslo:"",pant:""}); };

  // ── Computed ──
  const mealDone=(id:string)=>mealPlan[id]?.categories.filter(c=>c.required!==false).every(c=>(dayData[id]?.[c.id]||[]).length>0)??false;
  const doneCount=MEAL_ORDER.filter(mealDone).length;
  const pct=Math.round((doneCount/MEAL_ORDER.length)*100);
  const water=dayData.water||0;
  const wellness=getWellness();
  const yr=calMonth.getFullYear(),mo=calMonth.getMonth();
  const firstDay=new Date(yr,mo,1).getDay(),daysInMo=new Date(yr,mo+1,0).getDate();
  const cells:(Date|null)[]=[]; for(let i=0;i<firstDay;i++) cells.push(null); for(let d=1;d<=daysInMo;d++) cells.push(new Date(yr,mo,d));
  const weekMealDone=(mData:any,id:string)=>mData&&mealPlan[id]?.categories.filter(c=>c.required!==false).every(c=>(mData[id]?.[c.id]||[]).length>0);
  const weekPct=(mData:any)=>{ if(!mData) return 0; return Math.round(MEAL_ORDER.filter(id=>weekMealDone(mData,id)).length/MEAL_ORDER.length*100); };
  const latest=evals[evals.length-1];
  const isCustomPlan=JSON.stringify(mealPlan)!==JSON.stringify(DEFAULT_PLAN);
  const inp:any={width:"100%",border:`1.5px solid ${G.border}`,borderRadius:10,padding:"10px 13px",fontSize:15,outline:"none",boxSizing:"border-box",background:G.bg,color:G.text,fontFamily:"inherit"};
  const wellnessHistory=Array.from({length:14},(_,i)=>{ const d=new Date(today); d.setDate(d.getDate()-13+i); const data=lsGet(dayKey(d)); const wl=data?.wellness||{}; return {date:`${d.getDate()}/${d.getMonth()+1}`,sleep:wl.sleep||0,energy:wl.energy||0,mood:wl.mood||0}; });
  const gymExNames=[...new Set(Object.values(gymSessions).flatMap(s=>s.exercises.map(e=>e.name)))].sort();
  const selEx=gymSelectedEx||gymExNames[0]||"";
  const gymProgressData=Object.entries(gymSessions).filter(([_,s])=>s.exercises.some(e=>e.name===selEx)).map(([date,s])=>{ const ex=s.exercises.find(e=>e.name===selEx); const maxW=ex?Math.max(...ex.sets.map(s=>s.weight||0)):0; const totalV=ex?ex.sets.reduce((sum,s)=>(s.weight||0)*(s.reps||0)+sum,0):0; return {date:date.slice(5),maxPeso:maxW,volumen:totalV}; }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-12);

  // ══════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════
  if(authLoading) return (<div style={{fontFamily:"system-ui,sans-serif",background:G.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center" as const,color:G.muted}}><div style={{fontSize:48,marginBottom:12}}>⏳</div><div style={{fontSize:16,fontWeight:600,color:G.dark}}>Cargando...</div></div></div>);

  if(!uid) return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:`linear-gradient(150deg,${G.dark},${G.mid})`,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400,textAlign:"center" as const}}>
        <div style={{fontSize:64,marginBottom:16}}>💪</div>
        <div style={{color:"rgba(255,255,255,0.7)",fontSize:13,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>Bienvenido a</div>
        <div style={{color:"#fff",fontSize:32,fontWeight:800,letterSpacing:-0.5,marginBottom:8}}>Mi Progreso</div>
        <div style={{color:"rgba(255,255,255,0.65)",fontSize:15,lineHeight:1.6,marginBottom:40}}>Seguimiento de alimentación, bienestar y entrenamiento personalizado.</div>
        <button onClick={handleLogin} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,width:"100%",padding:"16px 24px",background:"#fff",border:"none",borderRadius:14,cursor:"pointer",fontSize:16,fontWeight:700,color:G.dark,boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
          <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continuar con Google
        </button>
        <div style={{color:"rgba(255,255,255,0.4)",fontSize:12,marginTop:24,lineHeight:1.6}}>Tus datos son privados y solo tú puedes acceder a ellos.</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:G.bg,minHeight:"100vh",display:"flex",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:maxW,position:"relative",paddingBottom:84}}>

        {notifBanner&&<div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:maxW,background:G.dark,color:"#fff",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}><span style={{fontSize:16,fontWeight:600}}>{notifBanner.emoji} ¡Hora de {notifBanner.label}!</span><button onClick={()=>setNotifBanner(null)} style={{background:"transparent",border:"none",color:"#fff",fontSize:24,cursor:"pointer",lineHeight:1}}>×</button></div>}

        {mergeNotice&&<div style={{position:"fixed",top:notifBanner?56:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:maxW,background:G.green,color:"#fff",padding:"12px 16px",zIndex:199,boxShadow:"0 4px 20px rgba(0,0,0,0.25)"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>✓ Se unificaron {mergeNotice.merges.length} {mergeNotice.merges.length===1?"ejercicio duplicado":"ejercicios duplicados"}</div>
              <div style={{fontSize:12,opacity:0.95,lineHeight:1.5}}>{mergeNotice.merges.slice(0,4).map((m,i)=><div key={i}>{m.from} → <b>{m.to}</b></div>)}{mergeNotice.merges.length>4&&<div style={{opacity:0.85,fontStyle:"italic" as const}}>+ {mergeNotice.merges.length-4} más…</div>}</div>
            </div>
            <button onClick={()=>setMergeNotice(null)} style={{background:"transparent",border:"none",color:"#fff",fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button>
          </div>
        </div>}

        <div style={{background:`linear-gradient(150deg,${G.dark},${G.mid})`,padding:isMobile?"18px 18px 16px":"22px 26px 18px",color:"#fff"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontSize:11,opacity:0.6,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:3}}>{auth.currentUser?.displayName||"Usuario"}</div><div style={{fontSize:isMobile?21:25,fontWeight:800,letterSpacing:-0.5}}>Mi Progreso</div></div>
            <div style={{display:"flex",flexDirection:"column" as const,alignItems:"flex-end",gap:5}}>
              {streak>0&&<div style={{background:"rgba(244,162,97,0.3)",borderRadius:99,padding:"5px 13px",fontSize:13,fontWeight:700}}>🔥 {streak} días</div>}
              {savedFlash&&<div style={{background:"rgba(82,183,136,0.35)",borderRadius:99,padding:"5px 13px",fontSize:12,fontWeight:700}}>✓ Guardado</div>}
              <div style={{fontSize:11,color:SYNC_COLOR[syncStatus],fontWeight:600}}>{SYNC_LABEL[syncStatus]}</div>
            </div>
          </div>
          {tab==="day"&&<div style={{marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",fontSize:14,opacity:0.85,marginBottom:6}}><span>{doneCount}/{MEAL_ORDER.length} comidas · 💧 {water}/{WATER_TARGET}</span><b>{pct}%</b></div><div style={{background:"rgba(255,255,255,0.2)",borderRadius:99,height:7,overflow:"hidden"}}><div style={{background:G.accent,height:"100%",width:`${pct}%`,borderRadius:99,transition:"width 0.4s"}}/></div></div>}
        </div>

        {/* ═══ TAB: DÍA ═══ */}
        {tab==="day"&&(
          <div style={{padding:pad}}>
            <Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}><NBtn onClick={()=>setCalMonth(new Date(yr,mo-1,1))}>‹</NBtn><span style={{fontWeight:800,fontSize:16,color:G.dark}}>{MONTHS[mo]} {yr}</span><NBtn onClick={()=>setCalMonth(new Date(yr,mo+1,1))}>›</NBtn></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>{WDAYS.map((d,i)=><div key={i} style={{textAlign:"center" as const,fontSize:12,fontWeight:700,color:G.muted}}>{d}</div>)}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>{cells.map((d,i)=>{ if(!d) return <div key={i}/>; const isTod=sameDay(d,today),isSel=sameDay(d,selected); return <button key={i} onClick={()=>setSelected(d)} style={{border:"none",borderRadius:11,padding:"8px 2px",cursor:"pointer",fontWeight:isSel||isTod?800:400,fontSize:14,background:isSel?G.mid:isTod?G.light:"transparent",color:isSel?"#fff":isTod?G.dark:"#444"}}>{d.getDate()}</button>; })}</div>
            </Card>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}><span style={{fontWeight:700,fontSize:16,color:G.text}}>💧 Hidratación</span><span style={{fontSize:14,color:G.muted,fontWeight:600}}>{water*300} / 2400 cc</span></div>
              <div style={{display:"flex",gap:5}}>{Array.from({length:WATER_TARGET},(_,i)=><button key={i} onClick={()=>setWater(i<water?i:i+1)} style={{flex:1,height:38,border:`2px solid ${i<water?G.accent:G.border}`,borderRadius:10,cursor:"pointer",fontSize:16,background:i<water?G.light:G.white,transition:"all 0.13s"}}>{i<water?"💧":"·"}</button>)}</div>
              {water>=WATER_TARGET&&<div style={{fontSize:13,color:G.green,fontWeight:700,marginTop:7,textAlign:"center" as const}}>✓ Meta alcanzada</div>}
            </Card>
            <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:13}}>{cap(selected.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"}))}</div>
            {MEAL_ORDER.map(mealId=>{ const meal=mealPlan[mealId]; if(!meal) return null; const done=mealDone(mealId),isExp=expanded===mealId,mData=dayData[mealId]||{},notes=mData.notes||""; return (
              <div key={mealId} style={{background:G.white,borderRadius:18,marginBottom:11,overflow:"hidden",boxShadow:"0 2px 10px rgba(14,32,68,0.07)",border:done?`2px solid ${G.green}`:`1.5px solid ${G.border}`}}>
                <div onClick={()=>setExpanded(isExp?null:mealId)} style={{display:"flex",alignItems:"center",padding:"15px 17px",cursor:"pointer",gap:13}}>
                  <span style={{fontSize:23}}>{meal.emoji}</span>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:16,color:G.text}}>{meal.label}</div><div style={{fontSize:13,color:G.muted,marginTop:1}}>{meal.time}</div></div>
                  {done?<span style={{background:"#eafaf2",color:G.green,borderRadius:99,padding:"5px 13px",fontSize:13,fontWeight:800}}>✓ Listo</span>:<span style={{color:"#ccc",fontSize:14}}>{isExp?"▲":"▼"}</span>}
                </div>
                {done&&!isExp&&<div style={{padding:"0 17px 13px",borderTop:`1px solid ${G.border}`}}>{meal.categories.map(cat=>{const sel=mData[cat.id]||[];return sel.length?<div key={cat.id} style={{fontSize:14,marginTop:5}}><span style={{color:G.muted}}>{cat.label}: </span><span style={{color:G.mid,fontWeight:700}}>{labelsOf(mealPlan,mealId,cat.id,sel).join(" · ")}</span></div>:null;})}{notes&&<div style={{fontSize:13,color:G.sub,marginTop:6,fontStyle:"italic"}}>📝 {notes}</div>}</div>}
                {isExp&&<div style={{padding:"6px 17px 17px",borderTop:`1px solid ${G.border}`}}>
                  {meal.categories.map(cat=>{ const sel=mData[cat.id]||[]; return <div key={cat.id} style={{marginTop:15}}><SLabel>{cat.label}{sel.length>0&&<span style={{color:G.mid,marginLeft:7,fontWeight:700,textTransform:"none" as const,letterSpacing:0,fontSize:13}}> → {labelsOf(mealPlan,mealId,cat.id,sel).join(", ")}</span>}</SLabel><div style={{display:"flex",flexWrap:"wrap" as const,gap:7}}>{cat.options.map(opt=><Chip key={opt.id} label={opt.label} active={sel.includes(opt.id)} onClick={()=>toggleOption(mealId,cat.id,opt.id,cat.single,cat.max)}/>)}</div></div>; })}
                  <div style={{marginTop:15}}><SLabel>📝 Notas</SLabel><textarea value={notes} onChange={e=>updateNote(mealId,e.target.value)} placeholder="Ej: comí en restaurante..." style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:11,padding:"11px 13px",fontSize:14,color:G.text,resize:"none" as const,background:G.bg,outline:"none",minHeight:58,boxSizing:"border-box" as const,fontFamily:"inherit",lineHeight:1.5}}/></div>
                </div>}
              </div>
            ); })}
            <div style={{background:G.white,borderRadius:18,marginBottom:11,overflow:"hidden",boxShadow:"0 2px 10px rgba(14,32,68,0.07)",border:`1.5px solid ${G.border}`}}>
              <div onClick={()=>setWellnessOpen(!wellnessOpen)} style={{display:"flex",alignItems:"center",padding:"15px 17px",cursor:"pointer",gap:13}}>
                <span style={{fontSize:23}}>🌟</span>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:16,color:G.text}}>Cómo estuvo el día</div><div style={{fontSize:13,color:G.muted,marginTop:1}}>{wellness.exercise?.length>0?wellness.exercise.map(id=>EXERCISE_OPTS.find(e=>e.id===id)?.emoji).join(" "):""}{wellness.sleep?` · 😴 ${wellness.sleep}h`:""}{wellness.energy?` · ⚡ ${wellness.energy}/5`:""}{!wellness.exercise?.length&&!wellness.sleep&&!wellness.energy&&"Registra tu día"}</div></div>
                <span style={{color:"#ccc",fontSize:14}}>{wellnessOpen?"▲":"▼"}</span>
              </div>
              {wellnessOpen&&<div style={{padding:"6px 17px 17px",borderTop:`1px solid ${G.border}`}}>
                <div style={{marginTop:15}}><SLabel>🏃 Ejercicio</SLabel><div style={{display:"flex",flexWrap:"wrap" as const,gap:7}}>{EXERCISE_OPTS.map(e=>{ const active=(wellness.exercise||[]).includes(e.id); return <button key={e.id} onClick={()=>{ const cur=wellness.exercise||[]; setWellness({exercise:cur.includes(e.id)?cur.filter(x=>x!==e.id):[...cur,e.id]}); }} style={{border:`2px solid ${active?G.mid:G.border}`,borderRadius:99,padding:"8px 15px",fontSize:14,fontWeight:active?700:400,background:active?G.light:G.white,color:active?G.dark:G.sub,cursor:"pointer"}}>{e.emoji} {e.label}</button>; })}</div></div>
                <div style={{marginTop:15}}><SLabel>💊 Suplementos</SLabel><div style={{display:"flex",flexWrap:"wrap" as const,gap:7}}>{([{k:"creatine" as const,l:"💪 Creatina"},{k:"omega3" as const,l:"🐟 Omega 3"},{k:"vitaminD" as const,l:"☀️ Vitamina D"}]).map(s=><button key={s.k} onClick={()=>setWellness({[s.k]:!wellness[s.k]})} style={{border:`2px solid ${wellness[s.k]?G.green:G.border}`,borderRadius:99,padding:"8px 15px",fontSize:14,fontWeight:wellness[s.k]?700:400,background:wellness[s.k]?"#eafaf2":G.white,color:wellness[s.k]?G.dark:G.sub,cursor:"pointer"}}>{s.l}</button>)}</div></div>
                <div style={{marginTop:15}}><SLabel>😴 Horas de sueño: <b style={{color:G.mid}}>{wellness.sleep||"—"}</b></SLabel><div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>{[4,5,6,7,8,9,10].map(h=><button key={h} onClick={()=>setWellness({sleep:wellness.sleep===h?0:h})} style={{border:`2px solid ${wellness.sleep===h?G.accent:G.border}`,borderRadius:99,padding:"7px 15px",fontSize:14,fontWeight:wellness.sleep===h?700:400,background:wellness.sleep===h?G.light:G.white,color:wellness.sleep===h?G.dark:G.sub,cursor:"pointer"}}>{h}h</button>)}</div></div>
                <div style={{marginTop:15}}><SLabel>⚡ Energía</SLabel><div style={{display:"flex",gap:9}}>{ENERGY_OPTS.map(e=><button key={e.v} onClick={()=>setWellness({energy:wellness.energy===e.v?0:e.v})} style={{flex:1,border:`2px solid ${wellness.energy===e.v?G.warm:G.border}`,borderRadius:13,padding:"10px 4px",fontSize:24,background:wellness.energy===e.v?"#fff8f0":G.white,cursor:"pointer"}}>{e.e}</button>)}</div></div>
                <div style={{marginTop:15}}><SLabel>😊 Ánimo</SLabel><div style={{display:"flex",gap:9}}>{MOOD_OPTS.map(e=><button key={e.v} onClick={()=>setWellness({mood:wellness.mood===e.v?0:e.v})} style={{flex:1,border:`2px solid ${wellness.mood===e.v?G.purple:G.border}`,borderRadius:13,padding:"10px 4px",fontSize:24,background:wellness.mood===e.v?"#f5f0ff":G.white,cursor:"pointer"}}>{e.e}</button>)}</div></div>
                <div style={{marginTop:15}}><SLabel>🍺 Alcohol</SLabel><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{([{k:"vino" as const,l:"🍷 Vino",u:"copa 150ml"},{k:"cerveza" as const,l:"🍺 Cerveza",u:"vaso 330ml"},{k:"destilado" as const,l:"🥃 Destilado",u:"trago 45ml"},{k:"otro" as const,l:"🍹 Otro",u:"unidad"}]).map(a=><div key={a.k} style={{border:`1.5px solid ${G.border}`,borderRadius:10,padding:"8px 10px",background:G.white}}><div style={{fontSize:12,fontWeight:700,color:G.dark,marginBottom:1}}>{a.l}</div><div style={{fontSize:10,color:G.muted,marginBottom:6}}>{a.u}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}><button onClick={()=>setWellness({alcohol:{...wellness.alcohol,[a.k]:Math.max(0,(wellness.alcohol?.[a.k]||0)-1)}})} style={{width:30,height:30,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,background:G.white,cursor:"pointer",fontWeight:700}}>−</button><span style={{fontSize:18,fontWeight:800,color:(wellness.alcohol?.[a.k]||0)>0?G.warm:G.muted,minWidth:20,textAlign:"center" as const}}>{wellness.alcohol?.[a.k]||0}</span><button onClick={()=>setWellness({alcohol:{...wellness.alcohol,[a.k]:(wellness.alcohol?.[a.k]||0)+1}})} style={{width:30,height:30,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,background:G.white,cursor:"pointer",fontWeight:700}}>+</button></div></div>)}</div></div>
                <div style={{marginTop:15,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <div><SLabel>🚬 Cigarrillos</SLabel><div style={{display:"flex",alignItems:"center",gap:9}}><button onClick={()=>setWellness({cigarettes:Math.max(0,wellness.cigarettes-1)})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>−</button><span style={{fontSize:22,fontWeight:800,color:wellness.cigarettes>0?G.red:G.muted,minWidth:30,textAlign:"center" as const}}>{wellness.cigarettes}</span><button onClick={()=>setWellness({cigarettes:wellness.cigarettes+1})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>+</button></div></div>
                  <div><SLabel>☕ Cafés</SLabel><div style={{display:"flex",alignItems:"center",gap:9}}><button onClick={()=>setWellness({coffees:Math.max(0,wellness.coffees-1)})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>−</button><span style={{fontSize:22,fontWeight:800,color:wellness.coffees>0?G.warm:G.muted,minWidth:30,textAlign:"center" as const}}>{wellness.coffees}</span><button onClick={()=>setWellness({coffees:wellness.coffees+1})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>+</button></div></div>
                  <div><SLabel>💊 Cafeína</SLabel><div style={{display:"flex",alignItems:"center",gap:9}}><button onClick={()=>setWellness({caffeinePills:Math.max(0,wellness.caffeinePills-1)})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>−</button><span style={{fontSize:22,fontWeight:800,color:wellness.caffeinePills>0?G.warm:G.muted,minWidth:30,textAlign:"center" as const}}>{wellness.caffeinePills}</span><button onClick={()=>setWellness({caffeinePills:wellness.caffeinePills+1})} style={{width:38,height:38,border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:20,background:G.white,cursor:"pointer",fontWeight:700}}>+</button></div></div>
                </div>
                <div style={{marginTop:15}}><SLabel>📝 Nota del día</SLabel><textarea value={wellness.note} onChange={e=>setWellness({note:e.target.value})} placeholder="¿Cómo estuvo tu día?" style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:11,padding:"11px 13px",fontSize:14,color:G.text,resize:"none" as const,background:G.bg,outline:"none",minHeight:76,boxSizing:"border-box" as const,fontFamily:"inherit",lineHeight:1.5}}/></div>
              </div>}
            </div>
            <div style={{display:"flex",gap:10,marginTop:4,marginBottom:18}}>
              <button onClick={handleSave} style={{flex:1,padding:"14px",background:G.mid,border:"none",borderRadius:13,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>💾 Guardar</button>
              {Object.keys(dayData).length>0&&<button onClick={clearDay} style={{padding:"14px 18px",background:"transparent",border:`1.5px solid ${G.border}`,borderRadius:13,color:G.sub,fontSize:15,cursor:"pointer"}}>🗑️</button>}
            </div>
          </div>
        )}

        {/* ═══ TAB: SEMANA ═══ */}
        {tab==="week"&&(()=>{
          const ws=getWeekStart(today,weekOffset);
          const wsL=ws.toLocaleDateString("es-CL",{day:"numeric",month:"short"});
          const weL=new Date(ws.getTime()+6*86400000).toLocaleDateString("es-CL",{day:"numeric",month:"short"});
          const wVals=Object.values(weekData).filter(Boolean) as any[];
          const avgPct=wVals.length?Math.round(wVals.reduce((s:number,d:any)=>s+weekPct(d),0)/wVals.length):0;
          const totalWater=wVals.reduce((s:number,d:any)=>s+(d.water||0),0);
          const bestPct=wVals.length?Math.max(...Object.keys(weekData).map(k=>weekData[k]?weekPct(weekData[k]):0)):0;
          const sleeps=wVals.map(d=>d.wellness?.sleep||0).filter(Boolean);
          const activeDays=wVals.filter(d=>{ const ex=Array.isArray(d.wellness?.exercise)?d.wellness.exercise:(d.wellness?.exercise?[d.wellness.exercise]:[]); return ex.length>0&&!ex.includes("descanso"); }).length;
          const avgMood=avg(wVals.map(d=>d.wellness?.mood||0).filter(Boolean));
          return <div style={{padding:isMobile?"14px":"18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><NBtn onClick={()=>setWeekOffset(o=>o-1)}>‹</NBtn><span style={{fontWeight:700,fontSize:16,color:G.dark}}>{wsL} – {weL}</span><NBtn onClick={()=>setWeekOffset(o=>o+1)} disabled={weekOffset>=0}>›</NBtn></div>
            {DAY_NAMES.map((name,i)=>{ const d=new Date(ws.getTime()+i*86400000),key=fmtDate(d),mData=weekData[key],dp=weekPct(mData),isTod=sameDay(d,today); const hasData=mData&&Object.keys(mData).length>0,wG=mData?.water||0; const barC=dp===100?G.green:dp>60?G.mid:dp>30?G.warm:G.border; const wl=mData?.wellness||{}; const exIds:string[]=Array.isArray(wl.exercise)?wl.exercise:(wl.exercise?[wl.exercise]:[]);
              return <div key={i} style={{background:G.white,borderRadius:18,marginBottom:11,padding:"15px 17px",boxShadow:"0 2px 8px rgba(14,32,68,0.06)",border:isTod?`2px solid ${G.accent}`:`1.5px solid ${G.border}`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:13}}>
                  <div style={{textAlign:"center" as const,minWidth:42}}><div style={{fontSize:11,fontWeight:800,color:G.muted,textTransform:"uppercase" as const}}>{name}</div><div style={{fontSize:23,fontWeight:800,color:isTod?G.mid:G.text}}>{d.getDate()}</div></div>
                  <div style={{flex:1}}>{hasData?<><div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:6}}><div style={{display:"flex",gap:4}}>{MEAL_ORDER.map(id=><div key={id} style={{width:9,height:9,borderRadius:"50%",background:weekMealDone(mData,id)?G.green:G.border}}/>)}</div><b style={{color:barC}}>{dp}%</b></div><Bar pct={dp} color={barC}/><div style={{fontSize:13,marginTop:6,display:"flex",gap:8,flexWrap:"wrap" as const,color:G.sub}}><span>{Array.from({length:WATER_TARGET},(_,j)=>j<wG?"💧":"○").join("")}</span>{exIds.map(id=>{ const opt=EXERCISE_OPTS.find(e=>e.id===id); return opt?<span key={id}>{opt.emoji} {opt.label}</span>:null; })}{wl.sleep?<span>😴 {wl.sleep}h</span>:null}{wl.energy?<span>⚡ {wl.energy}/5</span>:null}</div></>:<div style={{fontSize:14,color:"#bbb",fontStyle:"italic"}}>Sin registro</div>}</div>
                  <button onClick={()=>{setSelected(d);setTab("day");}} style={{background:G.light,border:"none",borderRadius:9,padding:"7px 13px",fontSize:13,fontWeight:700,color:G.mid,cursor:"pointer",flexShrink:0}}>Ir →</button>
                </div>
              </div>; })}
            <Card>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:14}}>Resumen semanal</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:10}}>
                {[{label:"Adherencia",val:wVals.length?`${avgPct}%`:"—",color:G.mid},{label:"Agua total",val:wVals.length?`${totalWater*300}cc`:"—",color:G.accent},{label:"Mejor día",val:wVals.length?`${bestPct}%`:"—",color:G.warm},{label:"Sueño prom.",val:sleeps.length?`${avg(sleeps)}h`:"—",color:G.purple},{label:"Días activos",val:`${activeDays}/7`,color:G.green},{label:"Ánimo prom.",val:avgMood?`${avgMood}/5`:"—",color:G.warm}].map((s,i)=>(
                  <div key={i} style={{textAlign:"center" as const,background:G.bg,borderRadius:13,padding:"13px 4px"}}><div style={{fontSize:21,fontWeight:800,color:s.color}}>{s.val}</div><div style={{fontSize:11,color:G.muted,marginTop:3}}>{s.label}</div></div>
                ))}
              </div>
              <div style={{display:"flex",gap:9,marginTop:11}}>
                <button onClick={()=>exportWeekPDF(weekData,ws,mealPlan)} style={{flex:1,padding:"13px",background:G.mid,border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>📥 Exportar PDF</button>
                <button onClick={runAiAnalysis} disabled={aiLoading||!apiKey} style={{flex:1,padding:"13px",background:!apiKey?"#ccc":aiLoading?"#6b92bb":G.dark,border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:700,cursor:!apiKey||aiLoading?"default":"pointer"}}>{aiLoading?"⏳ Analizando...":"🤖 Análisis IA"}</button>
              </div>
              {aiAnalysis&&<div style={{marginTop:15,padding:"15px",background:G.bg,borderRadius:13,border:`1.5px solid ${G.green}`}}><div style={{fontWeight:700,fontSize:14,color:G.dark,marginBottom:9}}>🤖 Análisis de la semana</div><div style={{fontSize:14,color:G.text,lineHeight:1.75,whiteSpace:"pre-wrap" as const}}>{aiAnalysis}</div></div>}
            </Card>
          </div>;
        })()}

        {/* ═══ TAB: GYM ═══ */}
        {tab==="gym"&&(
          <div style={{padding:pad}}>
            <Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <NBtn onClick={()=>{ const d=new Date(gymDate); d.setDate(d.getDate()-1); setGymDate(d); }}>‹</NBtn>
                <div style={{textAlign:"center" as const}}><div style={{fontWeight:800,fontSize:15,color:G.dark}}>{cap(gymDate.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"}))}</div>{gymSessions[fmtDate(gymDate)]&&<div style={{fontSize:12,color:G.green,marginTop:3,fontWeight:600}}>✓ Sesión guardada</div>}</div>
                <NBtn onClick={()=>{ const d=new Date(gymDate); d.setDate(d.getDate()+1); setGymDate(d); }}>›</NBtn>
              </div>
            </Card>
            {lastGymSession&&<Card style={{background:"#fff8f0",border:`1.5px solid ${G.warm}`}}><div style={{fontWeight:700,fontSize:14,color:G.warm,marginBottom:8}}>🏆 Supera estos registros</div><div style={{display:"flex",flexDirection:"column" as const,gap:5}}>{lastGymSession.exercises.map(ex=>{ const maxSet=ex.sets.reduce((best,s)=>(s.weight||0)>(best.weight||0)?s:best,ex.sets[0]); return maxSet?.weight?<div key={ex.id} style={{fontSize:13,color:G.sub,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600,color:G.text}}>{ex.name}</span><span>Max <b style={{color:G.warm}}>{maxSet.weight}kg</b> × {maxSet.reps} reps</span></div>:null; })}</div></Card>}
            {gymSession?.exercises.map((ex,exIdx)=>{
              const lastEx=lastGymSession?.exercises.find(e=>e.id===ex.id||e.name===ex.name);
              const lastMaxWeight=lastEx?Math.max(...lastEx.sets.map(s=>s.weight||0)):0;
              return (
                <Card key={ex.id}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:G.mid,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,flexShrink:0}}>{exIdx+1}</div>
                    <ExerciseNameInput value={ex.name} onChange={v=>updateGymExName(exIdx,v)} knownNames={gymExNames} placeholder="Nombre del ejercicio"/>
                    {gymSession.exercises.length>1&&<button onClick={()=>removeExercise(exIdx)} style={{background:"transparent",border:"none",color:G.red,cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button>}
                  </div>
                  {lastEx&&<div style={{fontSize:12,color:G.muted,marginBottom:12,padding:"8px 11px",background:G.bg,borderRadius:9,border:`1px solid ${G.border}`}}>Anterior: {lastEx.sets.map(s=>`${s.weight}kg×${s.reps}`).join(" · ")} {lastMaxWeight>0&&<span style={{color:G.warm,fontWeight:700}}>· Max: {lastMaxWeight}kg</span>}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"26px minmax(0,1fr) 18px minmax(0,1fr) 28px",gap:5,alignItems:"center",marginBottom:7}}>
                    <div/><div style={{fontSize:11,fontWeight:700,color:G.muted,textAlign:"center" as const}}>KG</div><div/><div style={{fontSize:11,fontWeight:700,color:G.muted,textAlign:"center" as const}}>REPS</div><div/>
                  </div>
                  {ex.sets.map((set,setIdx)=>{ const beats=lastMaxWeight>0&&(set.weight||0)>lastMaxWeight; return (
                    <div key={setIdx} style={{marginBottom:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"26px minmax(0,1fr) 18px minmax(0,1fr) 28px",gap:5,alignItems:"center"}}>
                        <div style={{fontSize:12,fontWeight:700,color:G.muted,textAlign:"center" as const}}>{setIdx+1}</div>
                        <input type="number" value={set.weight||""} placeholder="0" onChange={e=>updateSet(exIdx,setIdx,"weight",+e.target.value)} style={{minWidth:0,width:"100%",border:`2px solid ${beats?G.green:G.border}`,borderRadius:10,padding:"10px 4px",fontSize:16,fontWeight:700,textAlign:"center" as const,outline:"none",background:beats?"#eafaf2":G.white,color:beats?G.green:G.text,boxSizing:"border-box" as const}}/>
                        <div style={{fontSize:13,color:G.muted,textAlign:"center" as const}}>×</div>
                        <input type="number" value={set.reps||""} placeholder="0" onChange={e=>updateSet(exIdx,setIdx,"reps",+e.target.value)} style={{minWidth:0,width:"100%",border:`1.5px solid ${G.border}`,borderRadius:10,padding:"10px 4px",fontSize:16,fontWeight:700,textAlign:"center" as const,outline:"none",background:G.white,color:G.text,boxSizing:"border-box" as const}}/>
                        <button onClick={()=>removeSet(exIdx,setIdx)} style={{background:"transparent",border:"none",color:"#ccc",cursor:"pointer",fontSize:20,lineHeight:1,padding:0,textAlign:"center" as const}}>×</button>
                      </div>
                      {beats&&<div style={{fontSize:11,color:G.green,fontWeight:700,textAlign:"center" as const,marginTop:3}}>⚡ ¡Nuevo récord!</div>}
                    </div>
                  ); })}
                  <button onClick={()=>addSet(exIdx)} style={{width:"100%",padding:"9px",border:`1.5px dashed ${G.border}`,borderRadius:10,background:"transparent",color:G.muted,fontSize:14,cursor:"pointer",marginBottom:12}}>+ Agregar serie</button>
                  <input value={ex.notes} onChange={e=>updateGymExNotes(exIdx,e.target.value)} placeholder="Notas (sensaciones, técnica, lesiones...)" style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:9,padding:"9px 12px",fontSize:13,color:G.sub,background:G.bg,outline:"none",boxSizing:"border-box" as const}}/>
                </Card>
              );
            })}
            <button onClick={addExercise} style={{display:"block",width:"100%",padding:"13px",marginBottom:12,border:`2px dashed ${G.border}`,borderRadius:13,background:"transparent",color:G.muted,fontSize:15,cursor:"pointer"}}>＋ Agregar ejercicio</button>
            <Card style={{marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:15,color:G.dark,marginBottom:12}}>⏱️ Descanso entre series</div>
              <div style={{display:"flex",gap:7,marginBottom:14}}>{[{l:"45s",s:45},{l:"60s",s:60},{l:"90s",s:90},{l:"2min",s:120}].map(p=><button key={p.s} onClick={()=>startTimer(p.s)} style={{flex:1,padding:"9px 4px",border:`2px solid ${timerPreset===p.s&&timerSeconds>0?G.mid:G.border}`,borderRadius:11,background:timerPreset===p.s&&timerSeconds>0?G.light:G.white,color:timerPreset===p.s&&timerSeconds>0?G.dark:G.sub,fontWeight:timerPreset===p.s&&timerSeconds>0?700:400,fontSize:14,cursor:"pointer"}}>{p.l}</button>)}</div>
              {timerPreset>0&&<><div style={{position:"relative" as const,height:8,background:G.border,borderRadius:99,marginBottom:14,overflow:"hidden"}}><div style={{position:"absolute" as const,left:0,top:0,height:"100%",borderRadius:99,background:timerDone?G.red:timerSeconds<=10?G.warm:G.mid,width:`${timerPct}%`,transition:"width 1s linear"}}/></div><div style={{textAlign:"center" as const,marginBottom:14}}><div style={{fontSize:52,fontWeight:800,color:timerDone?G.red:timerSeconds<=10?G.warm:G.dark,letterSpacing:-1,lineHeight:1}}>{fmtTimer(timerSeconds)}</div>{timerDone&&<div style={{fontSize:14,color:G.red,fontWeight:700,marginTop:6}}>¡Tiempo! Siguiente serie 💪</div>}</div><div style={{display:"flex",gap:9}}><button onClick={toggleTimer} style={{flex:1,padding:"13px",background:timerRunning?G.warm:timerDone?G.red:G.mid,border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer"}}>{timerRunning?"⏸ Pausar":timerDone?"↺ Nueva serie":"▶ Reanudar"}</button><button onClick={resetTimer} style={{padding:"13px 16px",background:"transparent",border:`1.5px solid ${G.border}`,borderRadius:12,color:G.sub,fontSize:16,cursor:"pointer"}}>↺</button></div></>}
            </Card>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
            <button onClick={saveGymSession} style={{display:"block",width:"100%",padding:"15px",background:G.mid,border:"none",borderRadius:13,color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",marginBottom:18}}>{gymSaved?"✓ ¡Sesión guardada!":"💾 Guardar sesión"}</button>
          </div>
        )}

        {/* ═══ TAB: PROGRESO ═══ */}
        {tab==="progress"&&(
          <div style={{padding:pad}}>
            {latest&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:16}}>{[{label:"Grasa",val:`${latest.fatPct}%`,meta:`Meta: ${METAS.fatPct}%`,prog:(METAS.fatPct/latest.fatPct)*100,color:G.red},{label:"Músculo",val:`${latest.muscleKg} kg`,meta:`Meta: ${METAS.muscleKg} kg`,prog:(latest.muscleKg/METAS.muscleKg)*100,color:G.mid},{label:"Peso total",val:`${latest.weight} kg`,meta:`Eval. ${latest.date}`,prog:null,color:G.warm},{label:"Índice M/Óseo",val:latest.musOseo,meta:`Meta: ${METAS.musOseo}`,prog:(latest.musOseo/METAS.musOseo)*100,color:G.accent}].map((s,i)=><div key={i} style={{background:G.white,borderRadius:18,padding:"15px 17px",boxShadow:"0 2px 10px rgba(14,32,68,0.07)"}}><div style={{fontSize:11,fontWeight:700,color:G.muted,textTransform:"uppercase" as const,letterSpacing:0.8,marginBottom:5}}>{s.label}</div><div style={{fontSize:25,fontWeight:800,color:s.color}}>{s.val}</div><div style={{fontSize:12,color:G.muted,marginBottom:s.prog!=null?7:0}}>{s.meta}</div>{s.prog!=null&&<Bar pct={s.prog} color={s.color}/>}</div>)}</div>}
            <div style={{display:"flex",gap:7,marginBottom:13,overflowX:"auto" as const,paddingBottom:4}}>{[{id:"body",label:"Composición"},{id:"weight",label:"Peso"},{id:"phantom",label:"Perímetros"},{id:"somato",label:"Somatotipo"},{id:"wellness",label:"Bienestar"},{id:"gym",label:"💪 Gym"}].map(c=><button key={c.id} onClick={()=>setActiveChart(c.id)} style={{border:"none",borderRadius:99,padding:"9px 17px",fontSize:14,fontWeight:700,background:activeChart===c.id?G.mid:G.white,color:activeChart===c.id?"#fff":G.sub,cursor:"pointer",whiteSpace:"nowrap" as const,boxShadow:"0 1px 4px rgba(14,32,68,0.1)",flexShrink:0}}>{c.label}</button>)}</div>
            <Card style={{padding:"17px 11px 13px"}}>
              {activeChart==="body"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark}}>Composición Corporal</div></div><ResponsiveContainer width="100%" height={230}><LineChart data={evals} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Legend iconSize={10} wrapperStyle={{fontSize:12,paddingTop:5}}/><ReferenceLine y={METAS.fatPct} stroke={G.red} strokeDasharray="5 4"/><ReferenceLine y={METAS.muscleKg} stroke={G.mid} strokeDasharray="5 4"/><Line type="monotone" dataKey="fatPct" name="Grasa %" stroke={G.red} strokeWidth={2.5} dot={{r:5,fill:G.red}}/><Line type="monotone" dataKey="muscleKg" name="Músculo kg" stroke={G.mid} strokeWidth={2.5} dot={{r:5,fill:G.mid}}/></LineChart></ResponsiveContainer></>}
              {activeChart==="weight"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark}}>Peso Corporal Total</div></div><ResponsiveContainer width="100%" height={230}><LineChart data={evals} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis domain={[82,92]} tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Line type="monotone" dataKey="weight" name="Peso (kg)" stroke={G.warm} strokeWidth={2.5} dot={{r:5,fill:G.warm}}/></LineChart></ResponsiveContainer></>}
              {activeChart==="phantom"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark}}>Proporcionalidad Phantom</div></div><ResponsiveContainer width="100%" height={230}><LineChart data={evals} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Legend iconSize={10} wrapperStyle={{fontSize:12,paddingTop:5}}/><Line type="monotone" dataKey="brazo" name="Brazo" stroke={G.mid} strokeWidth={2.5} dot={{r:5,fill:G.mid}}/><Line type="monotone" dataKey="muslo" name="Muslo medio" stroke={G.warm} strokeWidth={2.5} dot={{r:5,fill:G.warm}}/><Line type="monotone" dataKey="pant" name="Pantorrilla" stroke={G.accent} strokeWidth={2.5} dot={{r:5,fill:G.accent}}/></LineChart></ResponsiveContainer></>}
              {activeChart==="somato"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark}}>Somatotipo</div></div><ResponsiveContainer width="100%" height={230}><LineChart data={evals} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Legend iconSize={10} wrapperStyle={{fontSize:12,paddingTop:5}}/><Line type="monotone" dataKey="endo" name="Endomorfia" stroke={G.red} strokeWidth={2.5} dot={{r:5,fill:G.red}}/><Line type="monotone" dataKey="meso" name="Mesomorfia" stroke={G.mid} strokeWidth={2.5} dot={{r:5,fill:G.mid}}/><Line type="monotone" dataKey="ecto" name="Ectomorfia" stroke={G.accent} strokeWidth={2.5} dot={{r:5,fill:G.accent}}/></LineChart></ResponsiveContainer></>}
              {activeChart==="wellness"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark}}>Bienestar — Últimos 14 días</div></div><ResponsiveContainer width="100%" height={230}><LineChart data={wellnessHistory} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Legend iconSize={10} wrapperStyle={{fontSize:12,paddingTop:5}}/><Line type="monotone" dataKey="sleep" name="Sueño (h)" stroke={G.purple} strokeWidth={2} dot={{r:4,fill:G.purple}} connectNulls/><Line type="monotone" dataKey="energy" name="Energía /5" stroke={G.warm} strokeWidth={2} dot={{r:4,fill:G.warm}} connectNulls/><Line type="monotone" dataKey="mood" name="Ánimo /5" stroke={G.accent} strokeWidth={2} dot={{r:4,fill:G.accent}} connectNulls/></LineChart></ResponsiveContainer></>}
              {activeChart==="gym"&&<><div style={{padding:"0 7px 11px"}}><div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:9}}>Progresión en Gym</div>{gymExNames.length>0?<select value={selEx} onChange={e=>setGymSelectedEx(e.target.value)} style={{...inp,width:"100%",marginBottom:10,fontSize:14}}>{gymExNames.map(n=><option key={n} value={n}>{n}</option>)}</select>:<div style={{fontSize:14,color:G.muted,marginBottom:10}}>Aún no hay sesiones registradas.</div>}</div>{gymProgressData.length>0?<ResponsiveContainer width="100%" height={230}><LineChart data={gymProgressData} margin={{top:5,right:11,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{fontSize:12,borderRadius:9}}/><Line type="monotone" dataKey="maxPeso" name="Peso máximo (kg)" stroke={G.mid} strokeWidth={2.5} dot={{r:5,fill:G.mid}}/></LineChart></ResponsiveContainer>:<div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:G.muted}}>Registra sesiones para ver la progresión.</div>}</>}
            </Card>
            <button onClick={()=>setShowAddEval(!showAddEval)} style={{display:"block",width:"100%",padding:"14px",marginBottom:13,background:showAddEval?G.sub:G.mid,border:"none",borderRadius:13,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>{showAddEval?"✕ Cancelar":"＋ Agregar nueva evaluación"}</button>
            {showAddEval&&<Card>
              <div style={{fontWeight:700,fontSize:16,color:G.dark,marginBottom:15}}>Nueva evaluación antropométrica</div>
              <input ref={evalFileRef} type="file" accept=".pdf" onChange={handleEvalPDFUpload} style={{display:"none"}}/>
              <button onClick={()=>{ if(!apiKey){setEvalPdfError("Configura tu API Key en ⚙️ Config primero."); return;} evalFileRef.current?.click(); }} disabled={evalPdfLoading} style={{display:"block",width:"100%",padding:"12px",marginBottom:10,background:evalPdfLoading?"#6b92bb":G.dark,border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:700,cursor:evalPdfLoading?"default":"pointer"}}>{evalPdfLoading?"⏳ Leyendo informe con IA...":"📄 Subir informe PDF (rellena automáticamente)"}</button>
              {evalPdfError&&<div style={{fontSize:12,color:G.red,padding:"9px 12px",background:"#fef0ee",borderRadius:9,marginBottom:10}}>{evalPdfError}</div>}
              <div style={{borderTop:`1px solid ${G.border}`,marginBottom:12,paddingTop:12}}>
                <div style={{fontSize:12,color:G.muted,marginBottom:10,textAlign:"center" as const}}>— o ingresa los datos manualmente —</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  {[{k:"date",label:"Fecha (DD/MM/AA)",full:true,ph:"30/04/26"},{k:"weight",label:"Peso (kg)",ph:"84.0"},{k:"fatPct",label:"Grasa %",ph:"11.5"},{k:"muscleKg",label:"Músculo (kg)",ph:"49.0"},{k:"musOseo",label:"Índice M/Óseo",ph:"3.8"},{k:"endo",label:"Endomorfia",ph:"2.8"},{k:"meso",label:"Mesomorfia",ph:"6.7"},{k:"ecto",label:"Ectomorfia",ph:"1.2"},{k:"sdd",label:"SDD",ph:"0.8"},{k:"brazo",label:"Brazo",ph:"6.2"},{k:"muslo",label:"Muslo",ph:"1.4"},{k:"pant",label:"Pantorrilla",ph:"1.6"}].map((f:any)=>(
                    <div key={f.k} style={{gridColumn:f.full?"1/-1":"auto"}}><SLabel>{f.label}</SLabel><input type={f.k==="date"?"text":"number"} value={newEval[f.k]||""} placeholder={f.ph} onChange={e=>setNewEval((n:any)=>({...n,[f.k]:e.target.value}))} style={inp}/></div>
                  ))}
                </div>
              </div>
              <button onClick={addEval} disabled={!newEval.date||!newEval.fatPct} style={{display:"block",width:"100%",padding:"13px",background:newEval.date&&newEval.fatPct?G.mid:"#ccc",border:"none",borderRadius:11,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>Guardar evaluación ☁️</button>
            </Card>}
            <Card><div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:13}}>Historial</div>{evals.map((ev:any,i:number)=><div key={ev.id} style={{padding:"11px 0",borderBottom:i<evals.length-1?`1px solid ${G.border}`:"none"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontWeight:700,fontSize:15,color:G.text}}>Evaluación {i+1}</span><span style={{fontSize:13,color:G.muted}}>{ev.date}</span></div><div style={{fontSize:14,color:G.sub}}>Grasa: <b style={{color:G.red}}>{ev.fatPct}%</b> · Músculo: <b style={{color:G.mid}}>{ev.muscleKg}kg</b> · Peso: <b>{ev.weight}kg</b></div></div>)}</Card>
          </div>
        )}

        {/* ═══ TAB: CONFIG ═══ */}
        {tab==="settings"&&(
          <div style={{padding:pad}}>
            {streak>0&&<div style={{background:`linear-gradient(135deg,${G.warm},#e8a04f)`,borderRadius:18,padding:"17px 22px",marginBottom:15,color:"#fff",display:"flex",alignItems:"center",gap:17}}><span style={{fontSize:42}}>🔥</span><div><div style={{fontSize:27,fontWeight:800}}>{streak} días consecutivos</div><div style={{fontSize:14,opacity:0.85}}>¡Racha activa! Sigue así.</div></div></div>}
            <Card>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:11}}>👤 Cuenta</div>
              <div style={{display:"flex",alignItems:"center",gap:13,padding:"13px 15px",background:G.bg,borderRadius:11,marginBottom:10}}>
                {auth.currentUser?.photoURL&&<img src={auth.currentUser.photoURL} style={{width:40,height:40,borderRadius:"50%",flexShrink:0}} alt="avatar"/>}
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:G.dark}}>{auth.currentUser?.displayName||"Usuario"}</div><div style={{fontSize:12,color:G.muted}}>{auth.currentUser?.email||""}</div></div>
                <div style={{width:10,height:10,borderRadius:"50%",background:SYNC_COLOR[syncStatus],flexShrink:0}}/>
              </div>
              <button onClick={handleLogout} style={{display:"block",width:"100%",padding:"11px",background:"transparent",border:`1.5px solid ${G.red}`,borderRadius:11,color:G.red,fontSize:14,fontWeight:700,cursor:"pointer"}}>Cerrar sesión</button>
            </Card>
            <Card>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:5}}>🔑 API Key de Google Gemini</div>
              <div style={{fontSize:14,color:G.muted,marginBottom:13,lineHeight:1.6}}>Para leer PDFs y el Análisis IA semanal. Obtenla gratis en <b>aistudio.google.com</b></div>
              <input type="password" value={apiKeyInput} onChange={e=>setApiKeyInput(e.target.value)} placeholder="AIzaSy..." style={inp}/>
              <button onClick={()=>{setApiKey(apiKeyInput);lsSet("gemini-api-key",apiKeyInput);alert("✅ API Key guardada");}} style={{display:"block",width:"100%",padding:"12px",marginTop:11,background:apiKeyInput?G.mid:"#ccc",border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Guardar API Key</button>
              {apiKey&&<div style={{fontSize:13,color:G.green,marginTop:9,textAlign:"center" as const}}>✓ API Key configurada</div>}
            </Card>
            <Card>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:5}}>📄 Plan de alimentación</div>
              <div style={{fontSize:14,color:G.muted,marginBottom:15,lineHeight:1.6}}>Sube el PDF del nutricionista. La IA extrae el plan y sincroniza en la nube.</div>
              <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDFUpload} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} disabled={!apiKey||pdfLoading} style={{display:"block",width:"100%",padding:"13px",background:!apiKey?"#ccc":pdfLoading?"#6b92bb":G.mid,border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:700,cursor:!apiKey||pdfLoading?"default":"pointer",marginBottom:9}}>{pdfLoading?"⏳ Procesando...":"📤 Subir PDF del nutricionista"}</button>
              {pdfError&&<div style={{fontSize:13,color:G.red,padding:"11px 13px",background:"#fef0ee",borderRadius:9,marginTop:7}}>{pdfError}</div>}
              {pdfPreview&&<div style={{marginTop:13,padding:"15px",background:G.bg,borderRadius:13,border:`1.5px solid ${G.green}`}}><div style={{fontWeight:700,fontSize:14,color:G.dark,marginBottom:11}}>✅ Plan detectado:</div>{Object.entries(pdfPreview).map(([id,meal]:any)=><div key={id} style={{fontSize:14,color:G.sub,marginBottom:6,padding:"6px 0",borderBottom:`1px solid ${G.border}`}}><b style={{color:G.mid}}>{meal.emoji} {meal.label}</b>: {meal.categories.reduce((s:number,c:any)=>s+c.options.length,0)} opciones</div>)}<button onClick={applyNewPlan} style={{display:"block",width:"100%",padding:"12px",marginTop:13,background:G.green,border:"none",borderRadius:11,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>✅ Aplicar y sincronizar ☁️</button><button onClick={()=>setPdfPreview(null)} style={{display:"block",width:"100%",padding:"10px",marginTop:9,background:"transparent",border:`1px solid ${G.border}`,borderRadius:11,color:G.sub,fontSize:13,cursor:"pointer"}}>Cancelar</button></div>}
              {isCustomPlan&&!pdfPreview&&<button onClick={async()=>{setMealPlan(DEFAULT_PLAN);await syncPlan(DEFAULT_PLAN);}} style={{display:"block",width:"100%",padding:"10px",marginTop:11,background:"transparent",border:`1.5px solid ${G.border}`,borderRadius:11,color:G.sub,fontSize:13,cursor:"pointer"}}>↩ Volver al plan por defecto</button>}
            </Card>
            <Card>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:5}}>📁 Mis documentos</div>
              <div style={{fontSize:14,color:G.muted,marginBottom:15,lineHeight:1.6}}>Sube tus informes y planes en PDF. Cada usuario tiene su propio espacio privado.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{padding:"15px",backgroundColor:"#fff7ed",borderRadius:13,border:"1px solid #ffedd5"}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#9a3412",marginBottom:8}}>Evaluación y Control</div>
                  <label style={{display:"block",padding:"10px",backgroundColor:uploadingControl?"#9ca3af":"#ea580c",color:"white",textAlign:"center" as const,borderRadius:9,fontWeight:"bold",cursor:uploadingControl?"default":"pointer",fontSize:13}}>
                    {uploadingControl?"⏳ Subiendo...":"📤 Subir PDF"}
                    <input type="file" accept=".pdf" style={{display:"none"}} onChange={e=>handleSupabaseUpload(e,"control")} disabled={uploadingControl}/>
                  </label>
                  {controlUrl&&<a href={controlUrl} target="_blank" rel="noreferrer" style={{display:"block",marginTop:10,color:"#c2410c",fontSize:12,textAlign:"center" as const,fontWeight:500}}>🔗 Ver último control</a>}
                </div>
                <div style={{padding:"15px",backgroundColor:"#eff6ff",borderRadius:13,border:"1px solid #dbeafe"}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1e40af",marginBottom:8}}>Plan Alimenticio</div>
                  <label style={{display:"block",padding:"10px",backgroundColor:uploadingPauta?"#9ca3af":"#2563eb",color:"white",textAlign:"center" as const,borderRadius:9,fontWeight:"bold",cursor:uploadingPauta?"default":"pointer",fontSize:13}}>
                    {uploadingPauta?"⏳ Subiendo...":"📤 Subir PDF"}
                    <input type="file" accept=".pdf" style={{display:"none"}} onChange={e=>handleSupabaseUpload(e,"pauta")} disabled={uploadingPauta}/>
                  </label>
                  {pautaUrl&&<a href={pautaUrl} target="_blank" rel="noreferrer" style={{display:"block",marginTop:10,color:"#1d4ed8",fontSize:12,textAlign:"center" as const,fontWeight:500}}>🔗 Ver pauta</a>}
                </div>
              </div>
            </Card>
            <Card style={{background:"linear-gradient(135deg,#f0f6ff,#e4eeff)",border:"1.5px solid #b4cafe",marginBottom:20}}>
              <div style={{fontWeight:800,fontSize:16,color:G.dark,marginBottom:5}}>📱 Instalar como app</div>
              <div style={{fontSize:14,color:G.sub,lineHeight:1.7,marginBottom:12}}>Agrega Mi Progreso a tu pantalla de inicio para usarla como una app nativa.</div>
              <div style={{background:"rgba(255,255,255,0.7)",borderRadius:12,padding:"12px 14px",marginBottom:10}}><div style={{fontWeight:700,fontSize:13,color:G.dark,marginBottom:6}}>🍎 iPhone / iPad (Safari)</div><div style={{fontSize:13,color:G.sub,lineHeight:1.6}}>1. Abre esta URL en <b>Safari</b><br/>2. Toca el ícono de compartir <b>⎙</b><br/>3. Selecciona <b>"Agregar a pantalla de inicio"</b></div></div>
              <div style={{background:"rgba(255,255,255,0.7)",borderRadius:12,padding:"12px 14px"}}><div style={{fontWeight:700,fontSize:13,color:G.dark,marginBottom:6}}>🤖 Android (Chrome)</div><div style={{fontSize:13,color:G.sub,lineHeight:1.6}}>1. Abre esta URL en <b>Chrome</b><br/>2. Toca el menú <b>⋮</b> (tres puntos)<br/>3. Selecciona <b>"Agregar a pantalla de inicio"</b></div></div>
            </Card>
          </div>
        )}

        {/* NAV */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:maxW,background:G.white,borderTop:`1px solid ${G.border}`,display:"flex",justifyContent:"space-around",padding:"10px 0 16px",boxShadow:"0 -2px 18px rgba(14,32,68,0.1)",zIndex:100}}>
          {[{id:"day",label:"Día",icon:"📅"},{id:"week",label:"Semana",icon:"📊"},{id:"gym",label:"Gym",icon:"💪"},{id:"progress",label:"Progreso",icon:"📈"},{id:"settings",label:"Config",icon:"⚙️"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column" as const,alignItems:"center",gap:3,color:tab===t.id?G.mid:"#aaa",padding:"4px 8px"}}>
              <span style={{fontSize:22}}>{t.icon}</span>
              <span style={{fontSize:10,fontWeight:tab===t.id?800:400}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
