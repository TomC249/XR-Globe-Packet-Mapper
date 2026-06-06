import{t as e}from"./shaderStore-Dw977DTa.js";var t=`fogFragment`,n=`#ifdef FOG
float fog=CalcFogFactor();
#ifdef PBR
fog=toLinearSpace(fog);
#endif
color.rgb=mix(vFogColor,color.rgb,fog);
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);
//# sourceMappingURL=fogFragment-DHsBd1GN.js.map