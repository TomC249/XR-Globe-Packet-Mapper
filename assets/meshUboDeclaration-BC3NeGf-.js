import{t as e}from"./shaderStore-DZjcEDJh.js";var t=`meshUboDeclaration`,n=`#ifdef WEBGL2
uniform mat4 world;uniform float visibility;
#else
layout(std140,column_major) uniform;uniform Mesh
{mat4 world;float visibility;};
#endif
#define WORLD_UBO
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);
//# sourceMappingURL=meshUboDeclaration-BC3NeGf-.js.map