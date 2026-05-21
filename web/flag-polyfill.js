(function () {
  function supportsFlagEmoji() {
    var canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "28px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("\uD83C\uDDFA\uD83C\uDDF8", 0, 0);
    var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) return true;
    }
    return false;
  }

  if (!supportsFlagEmoji()) {
    document.documentElement.classList.add("flag-emoji-polyfill");
  }
})();
