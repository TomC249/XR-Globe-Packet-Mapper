import{t as e}from"./shaderStore-Dw977DTa.js";import"./helperFunctions-Cs35sAMQ.js";import"./hdrFilteringFunctions-DWMaJEAj.js";import"./pbrBRDFFunctions-Dyh_-r6u.js";var t=`hdrIrradianceFilteringPixelShader`,n=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform samplerCube inputTexture;
#ifdef IBL_CDF_FILTERING
uniform sampler2D icdfTexture;
#endif
uniform vec2 vFilteringInfo;uniform float hdrScale;varying vec3 direction;void main() {vec3 color=irradiance(inputTexture,direction,vFilteringInfo
#ifdef IBL_CDF_FILTERING
,icdfTexture
#endif
);gl_FragColor=vec4(color*hdrScale,1.0);}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=hdrIrradianceFiltering.fragment-B0KzjYGB.js.map