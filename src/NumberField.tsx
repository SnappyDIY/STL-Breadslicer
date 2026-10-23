import React,{useEffect,useRef,useState} from 'react';

type Props=Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'|'onBlur'|'onFocus'|'onKeyDown'> & {
  value:number|string;
  onCommit:(value:number)=>void|number|false;
  integer?:boolean;
};

/** Keep incomplete number edits local; Enter or focus loss commits once. */
export function NumberField({value,onCommit,disabled,min,max,integer=false,...props}:Props){
  const [draft,setDraft]=useState(String(value));
  const [editing,setEditing]=useState(false);
  const focused=useRef(false);
  useEffect(()=>{if(!focused.current)setDraft(String(value));},[value]);
  return <input {...props} type="number" value={draft} min={min} max={max}
    disabled={disabled&&!editing}
    onFocus={()=>{focused.current=true;setEditing(true);}}
    onChange={event=>setDraft(event.currentTarget.value)}
    onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.blur();}}}
    onBlur={event=>{
      focused.current=false;setEditing(false);
      const text=event.currentTarget.value.trim(),number=Number(text);
      const valid=text!==''&&Number.isFinite(number)&&(!integer||Number.isInteger(number))&&
        (min===undefined||number>=Number(min))&&(max===undefined||number<=Number(max));
      if(!valid){setDraft(String(value));return;}
      setDraft(String(number));
      if(number!==Number(value)){const accepted=onCommit(number);if(accepted===false)setDraft(String(value));else if(typeof accepted==='number')setDraft(String(accepted));}
    }}/>
}
