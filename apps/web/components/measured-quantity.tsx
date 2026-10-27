"use client";
import Decimal from "decimal.js";
import {useEffect,useId,useRef,useState} from "react";
import {measuredQuantity,measurementDisplay,measurementEntries,type Measurement,type MeasurementEntry} from "@agristore/domain";

/** Hidden command value stays canonical; visible entry and its unit remain together. */
export function MeasuredQuantity({label,entryLabel=label,name,measurement,initial="",positive=false,required=true,disabled=false,max,onValueChange}:{label:string;entryLabel?:string;name?:string;measurement:Measurement;initial?:string;positive?:boolean;required?:boolean;disabled?:boolean;max?:string;onValueChange?:(value:string)=>void}){
 const [raw,setRaw]=useState(initial),[mode,setMode]=useState<MeasurementEntry>("unit"),[touched,setTouched]=useState(false),[switchError,setSwitchError]=useState("");const id=useId(),input=useRef<HTMLInputElement>(null),initialValue=useRef(initial);
 const options=measurementEntries(measurement);let quantity="",base="",error="";
 try{if(raw.trim()||required){const result=measuredQuantity(raw,mode,measurement,positive);quantity=result.quantity;base=result.baseQuantity;if(max!==undefined&&!new Decimal(max).isFinite())throw new Error("Refresh the available quantity before saving.");if(max!==undefined&&compare(quantity,max)>0)throw new Error("Quantity exceeds the remaining amount. Check the latest stock record.");}}
 catch(e){error=e instanceof Error?e.message:"Check this quantity and entry unit.";}
 useEffect(()=>{input.current?.setCustomValidity(raw.trim()?error:"");},[raw,error]);
 useEffect(()=>{const form=input.current?.form;function reset(){setRaw(initialValue.current);setMode("unit");setTouched(false);setSwitchError("");}form?.addEventListener("reset",reset);return()=>form?.removeEventListener("reset",reset);},[]);
 function edit(value:string,next=mode){setRaw(value);setTouched(true);setSwitchError("");try{onValueChange?.(value.trim()?measuredQuantity(value,next,measurement,positive).quantity:"");}catch{onValueChange?.("");}}
 const shownLabel=mode==="unit"?label:`${entryLabel} (${options.find(o=>o.value===mode)!.label})`;
 const shownError=switchError||(touched&&raw.trim()?error:"");
 return <div className="measured-quantity">
  {options.length>1&&<label className="field"><span id={`${id}-unit-label`}>{entryLabel} entry unit</span><select aria-labelledby={`${id}-unit-label`} value={mode} disabled={disabled} onChange={e=>{const next=e.target.value as MeasurementEntry;try{const value=raw.trim()?measurementDisplay(measuredQuantity(raw,mode,measurement).quantity,next,measurement):"";setMode(next);edit(value,next);}catch(e){setSwitchError(e instanceof Error?e.message:"Finish the quantity before switching units.");}}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
  <label className="field"><span>{shownLabel}</span><input ref={input} inputMode="decimal" autoComplete="off" required={required} disabled={disabled} value={raw} aria-invalid={!!shownError} aria-describedby={`${id}-equivalent${shownError?` ${id}-error`:""}`} onChange={e=>edit(e.target.value)}/></label>
  {name&&<input type="hidden" name={name} disabled={disabled} value={error?"":quantity}/>}
  <small id={`${id}-equivalent`}>{!error&&raw.trim()?`Recorded: ${quantity} ${measurement.unitName} = ${base} ${measurement.baseUnit}.`:`Stock measurement: ${measurement.baseUnit}. One ${measurement.unitName} = ${measurement.factor} ${measurement.baseUnit}.`}</small>
  {shownError&&<p id={`${id}-error`} role="alert" className="quantity-error">{shownError}</p>}
 </div>;
}
const compare=(a:string,b:string)=>new Decimal(a).cmp(b);
