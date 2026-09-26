# Minimal local static server for the analysis tooling.
# GET serves files from this folder; POST /save?name=<file> writes the body to data/<file>.
param([int]$Port = 8765)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
$types = @{ '.html'='text/html'; '.js'='application/javascript'; '.json'='application/json'; '.css'='text/css'; '.wasm'='application/wasm' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ($req.HttpMethod -eq 'POST' -and $path -eq 'save') {
      $name = [IO.Path]::GetFileName($req.QueryString['name'])
      $reader = [IO.StreamReader]::new($req.InputStream, [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText((Join-Path $root "data\$name"), $reader.ReadToEnd(), [Text.UTF8Encoding]::new($false))
      Write-Host "saved data\$name"
      $res.StatusCode = 204
    } else {
      if ($path -eq '') { $path = 'index.html' }
      $file = Join-Path $root $path
      if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith($root)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file)
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    }
  } catch { Write-Host $_; $res.StatusCode = 500 }
  $res.Close()
}
