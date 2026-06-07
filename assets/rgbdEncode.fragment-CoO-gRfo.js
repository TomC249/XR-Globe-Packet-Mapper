import{t as e}from"./shaderStore-DZjcEDJh.js";import"./helperFunctions-BAm9aq7c.js";var t=`rgbdEncodePixelShader`,n=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=toRGBD(texture2D(textureSampler,vUV).rgb);}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=rgbdEncode.fragment-CoO-gRfo.js.map