# Unbuffered stdout. Emits:
#   left | right | up   — Right Ctrl + arrow
#   submit              — Space
#   clear               — Escape
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RightCtrlKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v);
}
"@

$vkRControl = 0xA3
$vkLeft = 0x25
$vkUp = 0x26
$vkRight = 0x27
$vkSpace = 0x20
$vkEsc = 0x1B
$prev = ''

function Emit([string]$name) {
  [Console]::Out.WriteLine($name)
  [Console]::Out.Flush()
}

while ($true) {
  $right = [RightCtrlKeys]::GetAsyncKeyState($vkRControl) -band 0x8000
  $combo = ''
  if ($right) {
    if ([RightCtrlKeys]::GetAsyncKeyState($vkLeft) -band 0x8000) { $combo = 'left' }
    elseif ([RightCtrlKeys]::GetAsyncKeyState($vkRight) -band 0x8000) { $combo = 'right' }
    elseif ([RightCtrlKeys]::GetAsyncKeyState($vkUp) -band 0x8000) { $combo = 'up' }
  }
  if (-not $combo) {
    if ([RightCtrlKeys]::GetAsyncKeyState($vkSpace) -band 0x8000) { $combo = 'submit' }
    elseif ([RightCtrlKeys]::GetAsyncKeyState($vkEsc) -band 0x8000) { $combo = 'clear' }
  }
  if ($combo -and $combo -ne $prev) {
    Emit $combo
  }
  $prev = $combo
  Start-Sleep -Milliseconds 25
}
