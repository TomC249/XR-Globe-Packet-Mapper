precision highp float;

// Attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

// Uniforms
uniform mat4 world;
uniform mat4 view;
uniform mat4 projection;
uniform mat4 normalMatrix;

// Varyings
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vNormal = normalize(vec3(normalMatrix * vec4(normal, 0.0)));
  vPosition = vec3(world * vec4(position, 1.0));
  gl_Position = projection * view * vec4(vPosition, 1.0);
}
