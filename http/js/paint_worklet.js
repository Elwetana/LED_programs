class Starfield {
    paint(ctx, geom, properties) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc( 200, 200, 50, 0, 2*Math.PI);
        ctx.stroke();
        ctx.closePath();
    }
}
registerPaint('starfield', Starfield);