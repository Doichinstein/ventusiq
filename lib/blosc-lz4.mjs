/* Narrow, bounded Blosc v2 / LZ4 byte-shuffle reader. Apache-2.0.
   Format references and independent codec verification: docs/hrrr-smoke.md. */
export function decodeLz4(input,expected){
  if(!Number.isSafeInteger(expected)||expected<1||expected>9000000)throw Error('Invalid LZ4 output size');
  const out=new Uint8Array(expected);let p=0,q=0;
  const byte=()=>{if(p>=input.length)throw Error('Truncated LZ4 sequence');return input[p++];};
  const length=n=>{if(n===15){let extra;do{extra=byte();n+=extra;if(n>expected)throw Error('LZ4 length exceeds output');}while(extra===255);}return n;};
  while(p<input.length){const token=byte(),literal=length(token>>>4);if(p+literal>input.length||q+literal>expected)throw Error('LZ4 literal exceeds buffer');out.set(input.subarray(p,p+literal),q);p+=literal;q+=literal;if(p===input.length)break;const offset=byte()+(byte()<<8),count=length(token&15)+4;if(!offset||offset>q||q+count>expected)throw Error('Invalid LZ4 match');for(let i=0;i<count;i++)out[q+i]=out[q+i-offset];q+=count;}
  if(q!==expected)throw Error('LZ4 output length mismatch');return out;
}
export function decodeBlosc(input,expected){
  if(!(input instanceof Uint8Array)||input.length<16||input.length>12000000||!Number.isSafeInteger(expected)||expected<1||expected>9000000)throw Error('Invalid Blosc size');
  const v=new DataView(input.buffer,input.byteOffset,input.byteLength),flags=input[2],type=input[3],size=v.getUint32(4,true),block=v.getUint32(8,true),compressed=v.getUint32(12,true);
  if(input[0]!==2||input[1]!==1||(flags&12)!==0||(flags>>>5)!==1||![4,8].includes(type)||size!==expected||size%type||compressed!==input.length||!block||block>9000000||block%type)throw Error('Unsupported Blosc contract');
  if(flags&2){if(input.length!==size+16)throw Error('Invalid Blosc raw buffer');return input.slice(16);}
  const count=Math.ceil(size/block),tableEnd=16+count*4;if(tableEnd>input.length)throw Error('Truncated Blosc block table');const out=new Uint8Array(size),spans=[];
  for(let i=0;i<count;i++){let p=v.getUint32(16+i*4,true);const start=p,n=Math.min(block,size-i*block),split=!(flags&16)&&n===block&&n/type>=128?type:1,part=n/split,temp=new Uint8Array(n);if(p<tableEnd||p>=input.length||!Number.isInteger(part))throw Error('Invalid Blosc block offset');
    for(let j=0;j<split;j++){if(p+4>input.length)throw Error('Truncated Blosc split');const compressedPart=v.getUint32(p,true);p+=4;if(!compressedPart||p+compressedPart>input.length)throw Error('Invalid Blosc split size');const source=input.subarray(p,p+compressedPart);temp.set(compressedPart===part?source:decodeLz4(source,part),j*part);p+=compressedPart;}
    spans.push([start,p]);if(flags&1){const elements=n/type;for(let k=0;k<type;k++)for(let j=0;j<elements;j++)out[i*block+j*type+k]=temp[k*elements+j];}else out.set(temp,i*block);
  }
  let cursor=tableEnd;for(const [a,b] of spans.sort((a,b)=>a[0]-b[0])){if(a!==cursor)throw Error('Overlapping or missing Blosc blocks');cursor=b;}if(cursor!==input.length)throw Error('Trailing Blosc bytes');return out;
}
