$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$catalog = (& node --input-type=module -e "import {biomeScenery} from './src/fan/biome-scenery.ts';console.log(JSON.stringify(biomeScenery));") | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Could not read biome catalog" }
$output = Join-Path $root "standalone-public\scenery\biomes"
New-Item -ItemType Directory -Path $output -Force | Out-Null
foreach ($biome in $catalog) {
  $name = $biome[1]
  $master = Join-Path $root "art\biomes\$name.png"
  if (-not (Test-Path $master)) {
    if (Test-Path (Join-Path $output "$name.png")) { continue }
    throw "Missing source and shipped artwork for $name"
  }
  $source = [System.Drawing.Image]::FromFile($master)
  $bitmap = New-Object System.Drawing.Bitmap 1280, 720
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, 1280, 720))
    $bitmap.Save((Join-Path $output "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $source.Dispose() }
}
$font = New-Object System.Drawing.Font "Segoe UI", 14, ([System.Drawing.FontStyle]::Regular)
$titleFont = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
try {
  for ($page = 0; $page -lt 3; $page++) {
    $sheet = New-Object System.Drawing.Bitmap 1320, 1200
    $g = [System.Drawing.Graphics]::FromImage($sheet)
    try {
      $g.Clear([System.Drawing.Color]::FromArgb(14, 35, 43))
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.DrawString("HD Biome Gallery  -  $($page + 1) / 3", $titleFont, [System.Drawing.Brushes]::White, 14, 12)
      for ($i = 0; $i -lt 12; $i++) {
        $index = $page * 12 + $i
        if ($index -ge $catalog.Count) { break }
        $biome = $catalog[$index]
        $x = ($i % 3) * 440 + 8
        $y = [math]::Floor($i / 3) * 280 + 68
        $image = [System.Drawing.Image]::FromFile((Join-Path $output "$($biome[1]).png"))
        try { $g.DrawImage($image, (New-Object System.Drawing.Rectangle $x, $y, 424, 238)) }
        finally { $image.Dispose() }
        $g.DrawString($biome[2], $font, [System.Drawing.Brushes]::White, $x + 4, $y + 244)
      }
      $sheet.Save((Join-Path $root "standalone-public\scenery\biomes-overview-$($page + 1).jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
    } finally { $g.Dispose(); $sheet.Dispose() }
  }
} finally { $font.Dispose(); $titleFont.Dispose() }
