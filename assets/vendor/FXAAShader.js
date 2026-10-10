/**
 * FXAAShader —— 快速近似抗锯齿（Fast Approximate Anti-Aliasing）
 *
 * 来源：基于 NVIDIA FXAA 3.11 的经典算法手写实现（three.js 的 examples 副本
 * 未随本仓库提供，按官方同样接口手写）。许可与 three.js 一致（MIT）。
 *
 * 接口与 three 官方 FXAAShader 相同：
 *   uniforms.tDiffuse    输入纹理（ShaderPass 自动注入）
 *   uniforms.resolution  vec2，取 1/宽、1/高（绘制缓冲的像素尺寸倒数）
 *
 * 算法：
 *   1. 取中心与 8 邻域亮度，算局部对比度（luma range）
 *   2. 低于阈值（暗部 0.0312、亮部按比例 0.125）视为平坦区，直接输出
 *   3. 否则按亮度梯度估计边缘方向，沿边缘方向（而非跨边缘）做 4 抽样混合
 *   4. 混合权重由局部对比度决定，平坦区完全不动，只有边缘被平滑
 *
 * 注意：必须在收尾 shader（暗角/颗粒/色散）之后执行，否则后处理效果会被抹掉。
 */
THREE.FXAAShader = {

  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new THREE.Vector2(1 / 1024, 1 / 512) }
  },

  vertexShader: [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
    '}'
  ].join('\n'),

  fragmentShader: [
    'precision highp float;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 resolution;',
    'varying vec2 vUv;',
    '',
    'float fxaaLuma( vec3 rgb ) {',
    '  return dot( rgb, vec3( 0.299, 0.587, 0.114 ) );',
    '}',
    '',
    'void main() {',
    '  vec2 texel = resolution;',
    '  vec3 rgbM = texture2D( tDiffuse, vUv ).rgb;',
    '',
    '  float lM  = fxaaLuma( rgbM );',
    '  float lNW = fxaaLuma( texture2D( tDiffuse, vUv + vec2( -texel.x, -texel.y ) ).rgb );',
    '  float lNE = fxaaLuma( texture2D( tDiffuse, vUv + vec2(  texel.x, -texel.y ) ).rgb );',
    '  float lSW = fxaaLuma( texture2D( tDiffuse, vUv + vec2( -texel.x,  texel.y ) ).rgb );',
    '  float lSE = fxaaLuma( texture2D( tDiffuse, vUv + vec2(  texel.x,  texel.y ) ).rgb );',
    '  float lN  = fxaaLuma( texture2D( tDiffuse, vUv + vec2( 0.0,      -texel.y ) ).rgb );',
    '  float lS  = fxaaLuma( texture2D( tDiffuse, vUv + vec2( 0.0,       texel.y ) ).rgb );',
    '  float lE  = fxaaLuma( texture2D( tDiffuse, vUv + vec2(  texel.x, 0.0 ) ).rgb );',
    '  float lW  = fxaaLuma( texture2D( tDiffuse, vUv + vec2( -texel.x, 0.0 ) ).rgb );',
    '',
    '  float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );',
    '  float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );',
    '  float range = lMax - lMin;',
    '',
    '  /* 平坦区直接输出：避免全画面被无意义地模糊 */',
    '  float threshold = max( 0.0312, lMax * 0.125 );',
    '  if ( range < threshold ) {',
    '    gl_FragColor = vec4( rgbM, 1.0 );',
    '    return;',
    '  }',
    '',
    '  /* 亮度梯度（含对角加权），边缘方向 = 垂直于梯度 */',
    '  float gx = ( lNE + lSE ) - ( lNW + lSW ) + 2.0 * ( lE - lW );',
    '  float gy = ( lNW + lNE ) - ( lSW + lSE ) + 2.0 * ( lN - lS );',
    /* 梯度是边缘法线，采样方向应取其切线方向；否则会沿法线跨过边缘，
       把高对比度轮廓直接平均掉，太阳盘面和 HUD 细线会出现发糊。 */
    '  vec2 dir = abs( gx ) > abs( gy ) ? vec2( 0.0, texel.y ) : vec2( texel.x, 0.0 );',
    '',
    '  /* 沿边缘方向两端各取 1、2 像素，做 4 抽样平均 */',
    '  vec3 rgbA = texture2D( tDiffuse, vUv - dir * 1.0 ).rgb;',
    '  vec3 rgbB = texture2D( tDiffuse, vUv + dir * 1.0 ).rgb;',
    '  vec3 rgbC = texture2D( tDiffuse, vUv - dir * 2.0 ).rgb;',
    '  vec3 rgbD = texture2D( tDiffuse, vUv + dir * 2.0 ).rgb;',
    '  vec3 blur = ( rgbA + rgbB + rgbC + rgbD ) * 0.25;',
    '',
    '  /* 对比度越大越平滑，平坦区权重趋零 */',
    '  float w = clamp( range / ( lMax + 0.0001 ), 0.0, 1.0 );',
    '  gl_FragColor = vec4( mix( rgbM, blur, 0.5 * w ), 1.0 );',
    '}'
  ].join('\n')

};
