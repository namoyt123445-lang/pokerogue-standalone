$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
foreach ($name in @("meadow", "forest")) {
  $source = [System.Drawing.Image]::FromFile((Join-Path $root "art\$name-source.png"))
  $bitmap = New-Object System.Drawing.Bitmap 320, 180
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, 320, 180))
    $bitmap.Save((Join-Path $root "standalone-public\scenery\$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
  }
}
