import Image from "next/image";
/** Original AgriStore mark. No third-party business artwork is distributed. */
export function StoreBrand(){return <><Image className="store-logo" src="/icon.svg" alt="" width={192} height={192} loading="eager" unoptimized/><span>AgriStore <small>POINT OF SALE</small></span></>;}
