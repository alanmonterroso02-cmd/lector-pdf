Add-Type -AssemblyName System.Drawing

$res = "C:\Users\Admin\Desktop\lector-pdf\android\app\src\main\res"

function New-BookIcon {
    param(
        [int]$Size,
        [double]$GlyphScale = 0.60,
        [bool]$Rounded = $true
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # fondo transparente
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $c1 = [System.Drawing.ColorTranslator]::FromHtml("#D09546")
    $c2 = [System.Drawing.ColorTranslator]::FromHtml("#8A5514")

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($Rounded) {
        $r = [double]$Size * 0.22
        $d = $r * 2
        $path.AddArc(0, 0, $d, $d, 180, 90)
        $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
        $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
        $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
        $path.CloseFigure()
    } else {
        $path.AddEllipse(0, 0, $Size, $Size)
    }

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 55)
    $g.FillPath($brush, $path)

    # libro abierto
    $w = $Size * $GlyphScale
    $h = $Size * $GlyphScale * 0.78
    $cx = $Size / 2.0
    $cy = $Size / 2.0
    $gap = [Math]::Max(1.0, $Size * 0.018)

    $left = New-Object System.Drawing.Drawing2D.GraphicsPath
    $left.AddPolygon(@(
        (New-Object System.Drawing.PointF([float]($cx - $gap / 2), [float]($cy - $h * 0.34))),
        (New-Object System.Drawing.PointF([float]($cx - $w / 2), [float]($cy - $h * 0.46))),
        (New-Object System.Drawing.PointF([float]($cx - $w / 2), [float]($cy + $h * 0.34))),
        (New-Object System.Drawing.PointF([float]($cx - $gap / 2), [float]($cy + $h * 0.46)))
    ))

    $right = New-Object System.Drawing.Drawing2D.GraphicsPath
    $right.AddPolygon(@(
        (New-Object System.Drawing.PointF([float]($cx + $gap / 2), [float]($cy - $h * 0.34))),
        (New-Object System.Drawing.PointF([float]($cx + $w / 2), [float]($cy - $h * 0.46))),
        (New-Object System.Drawing.PointF([float]($cx + $w / 2), [float]($cy + $h * 0.34))),
        (New-Object System.Drawing.PointF([float]($cx + $gap / 2), [float]($cy + $h * 0.46)))
    ))

    $paper = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($paper, $left)
    $g.FillPath($paper, $right)

    # renglones sutiles
    $line = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 138, 85, 20))
    $lines = 3
    for ($i = 0; $i -lt $lines; $i++) {
        $y = $cy - $h * 0.12 + $i * ($h * 0.22)
        $lx = $cx - $w * 0.40
        $lw = $w * 0.30
        $g.FillRectangle($line, [float]$lx, [float]$y, [float]$lw, [float][Math]::Max(1.0, $Size * 0.020))
        $g.FillRectangle($line, [float]($cx + $w * 0.10), [float]$y, [float]$lw, [float][Math]::Max(1.0, $Size * 0.020))
    }

    $g.Dispose()
    return $bmp
}

$densities = @{
    "mdpi"    = @{ launcher = 48;  fg = 108 }
    "hdpi"    = @{ launcher = 72;  fg = 162 }
    "xhdpi"   = @{ launcher = 96;  fg = 216 }
    "xxhdpi"  = @{ launcher = 144; fg = 324 }
    "xxxhdpi" = @{ launcher = 192; fg = 432 }
}

foreach ($d in $densities.Keys) {
    $dir = Join-Path $res ("mipmap-" + $d)
    $L = $densities[$d].launcher
    $F = $densities[$d].fg

    $img = New-BookIcon -Size $L -GlyphScale 0.62 -Rounded $true
    $img.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()

    $img = New-BookIcon -Size $L -GlyphScale 0.62 -Rounded $false
    $img.Save((Join-Path $dir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()

    # capa frontal adaptativa: fondo transparente, glifo al ~45% (zona segura)
    $fgBmp = New-Object System.Drawing.Bitmap($F, $F)
    $fgG = [System.Drawing.Graphics]::FromImage($fgBmp)
    $fgG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $fgG.Clear([System.Drawing.Color]::Transparent)
    $inner = New-BookIcon -Size ([int]($F * 0.70)) -GlyphScale 0.66 -Rounded $true
    $off = [int](($F - $inner.Width) / 2)
    $fgG.DrawImage($inner, $off, $off, $inner.Width, $inner.Height)
    $fgG.Dispose(); $inner.Dispose()
    $fgBmp.Save((Join-Path $dir "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()

    Write-Host ("mipmap-" + $d + " OK")
}

# vista previa grande para revisar
$big = New-BookIcon -Size 512 -GlyphScale 0.62 -Rounded $true
$big.Save("C:\Users\Admin\Desktop\lector-pdf\tools\icon-preview.png", [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Host "preview OK"
