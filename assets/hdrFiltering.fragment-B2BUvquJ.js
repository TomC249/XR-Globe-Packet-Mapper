import{t as e}from"./shaderStore-Dw977DTa.js";import"./helperFunctions-Cs35sAMQ.js";import"./hdrFilteringFunctions-DWMaJEAj.js";import"./pbrBRDFFunctions-Dyh_-r6u.js";var t=`hdrFilteringPixelShader`,n=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform float alphaG;uniform samplerCube inputTexture;uniform vec2 vFilteringInfo;uniform float hdrScale;varying vec3 direction;void main() {vec3 color=radiance(alphaG,inputTexture,direction,vFilteringInfo);gl_FragColor=vec4(color*hdrScale,1.0);}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=hdrFiltering.fragment-B2BUvquJ.js.map