//https://www.codehim.com/vanilla-javascript/javascript-color-wheel-picker/
var ColorPicker;

(function() {

    function insertBefore(element, before) {
        parent = before.parentNode;
        parent.insertBefore(element, before);
    }

    function extend(defaults, options) {
        var extended = {};
        var prop;
        for (prop in defaults) {
            if (Object.prototype.hasOwnProperty.call(defaults, prop)) {
                extended[prop] = defaults[prop];
            }
        }
        for (prop in options) {
            if (Object.prototype.hasOwnProperty.call(options, prop)) {
                extended[prop] = options[prop];
            }
        }
        return extended;
    }

    function hasClass(element, classname) {
        var className = " " + classname + " ";
        if ((" " + element.className + " ").replace(/[\n\t]/g, " ").indexOf(" " + classname + " ") > -1) {
            return true;
        }
        return false;
    }

    function removeClass(node, className) {
        node.className = node.className.replace(
            new RegExp('(^|\\s+)' + className + '(\\s+|$)', 'g'),
            '$1'
        ).replace(/ +(?= )/g, '').trim();
    }

    function addClass(element, className) {
        if (!hasClass(element, className)) {
            element.className += ' ' + className;
            element.className = element.className.replace(/ +(?= )/g, '').trim()
        }
    }

    ColorPicker = function(element, options) {

        this.options = extend({
            color: '#e7e7e7',
            palettes: ['#646fff', '#fffa1d', '#ffa21f', '#ff391d'],
            onUpdate: function() {}
        }, options);

        this.options.palettes.unshift(this.options.color);

        this.hex = this.options.color;
        this.rgb = this.HEXtoRGB(this.hex);
        this.hsv = this.RGBtoHSV(this.rgb[0], this.rgb[1], this.rgb[2]);
        this.dom = {};
        this.dom.container = document.createElement('div');
        this.dom.container.className = 'color-picker-container';

        element.appendChild(this.dom.container);

        this.initPicker();

        this.initPalettes();
    }

    ColorPicker.prototype.initPicker = function() {

        this.dom.picker = {};
        this.dom.picker.container = document.createElement('div');
        this.dom.picker.container.className = 'picker-container';

        this.dom.container.appendChild(this.dom.picker.container);

        this.dom.picker.canvas = {};

        this.dom.picker.canvas.container = document.createElement('div');
        this.dom.picker.canvas.container.className = 'canvas-container';
        this.dom.picker.container.appendChild(this.dom.picker.canvas.container);

        this.dom.picker.canvas.canvas = document.createElement('canvas');
        this.dom.picker.canvas.canvas.className = 'canvas';

        this.dom.picker.canvas.pointer = document.createElement('div');
        this.dom.picker.canvas.pointer.className = 'pointer';

        var ctx = this.dom.picker.canvas.canvas.getContext('2d'),
            image = new Image,
            $this = this,
            dragging = false;

        this.dom.picker.canvas.canvas.setAttribute('width', 200);
        this.dom.picker.canvas.canvas.setAttribute('height', 200);
        this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.canvas);
        this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.pointer);

        image.src = './wheel.png';

        image.onload = function() {
            $this.updateCanvasBounds();
            ctx.drawImage(image, 0, 0, 200, 200);
            $this.updateCoordinates($this.dom.picker.canvas.canvas.bounds.centerX, $this.dom.picker.canvas.canvas.bounds.centerY);
            coordinates = $this.getPositionFromColor($this.hex);
            if (coordinates != null) {
                $this.x = coordinates.x;
                $this.y = coordinates.y;
                $this.updateColor($this.HEXtoRGB($this.hex));
                $this.updateAll();
            }
            $this.options.onUpdate($this.rgb);
        };

        this.dom.picker.canvas.canvas.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            $this.updateCoordinates(e.clientX, e.clientY);
            imageData = ctx.getImageData($this.x, $this.y, 1, 1);
            $this.updateColor(imageData.data);
            $this.hsv[2] = 1;
            $this.updateAll();
        });

        document.addEventListener('mousemove', function(e) { // mouse move handler
            if (dragging) {
                $this.updateCoordinates(e.pageX, e.pageY);
                imageData = ctx.getImageData($this.x, $this.y, 1, 1);
                $this.updateColor(imageData.data);
                $this.hsv[2] = 1;
                $this.updateAll();
            }
        });

        document.addEventListener('mouseup', function(e) { // click event handler
            dragging = false;
        });

        this.dom.picker.canvas.input = document.createElement('input'),

            this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.input);

        this.dom.picker.canvas.input.addEventListener('keyup', function() {
            if(this.value == $this.hex || '#' + this.value == $this.hex){
                return;
            }
            coordinates = $this.getPositionFromColor(this.value);
            if (coordinates != null) {
                $this.x = coordinates.x;
                $this.y = coordinates.y;
                $this.updateColor($this.HEXtoRGB(this.value));
                $this.updateAll();
            }
        });

        this.initSlider();

    }

    ColorPicker.prototype.initSlider = function() {

        this.dom.slider = {};
        this.dom.slider.container = document.createElement('div');
        this.dom.slider.container.className = 'slider-container';

        this.dom.slider.slider = document.createElement('div');
        this.dom.slider.slider.className = 'slider';

        this.dom.slider.pointer = document.createElement('div');
        this.dom.slider.pointer.className = 'pointer';

        this.dom.slider.container.appendChild(this.dom.slider.pointer);
        this.dom.slider.container.appendChild(this.dom.slider.slider);
        this.dom.picker.container.appendChild(this.dom.slider.container);

        this.dom.slider.slider.bounds = this.dom.slider.slider.getBoundingClientRect();
        this.dom.slider.pointer.bounds = this.dom.slider.pointer.getBoundingClientRect();

        this.redrawSlider();

        var dragging = false,
            $this = this;

        this.dom.slider.slider.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            total = $this.updateSliderCursor(e.clientY);
            $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
            $this.updateAll();
        });

        this.dom.slider.pointer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            total = $this.updateSliderCursor(e.clientY);
            $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
            $this.updateAll();
        });

        document.addEventListener('mousemove', function(e) {
            if (!dragging) {
                return;
            }
            total = $this.updateSliderCursor(e.clientY);
            $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
            $this.updateAll();
        });

        document.addEventListener('mouseup', function() {
            dragging = false;
        });
    };

    ColorPicker.prototype.updateColor = function(pixel) {
        this.hex = hex = this.RGBtoHEX(pixel[0], pixel[1], pixel[2]);
        this.hsv = this.RGBtoHSV(pixel[0], pixel[1], pixel[2]);
        this.rgb = [
            pixel[0],
            pixel[1],
            pixel[2]
        ];
    }

    ColorPicker.prototype.updateCoordinates = function(x, y) {
        var angle = Math.atan2((y - this.dom.picker.canvas.canvas.bounds.centerY), (x - this.dom.picker.canvas.canvas.bounds.centerX));
        radius = Math.sqrt(Math.pow(x - this.dom.picker.canvas.canvas.bounds.centerX, 2) + Math.pow(y - this.dom.picker.canvas.canvas.bounds.centerY, 2));
        if (radius > this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) {
            cos = Math.cos(angle);
            sin = Math.sin(angle);
            x = cos * (this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) + this.dom.picker.canvas.canvas.bounds.centerX;
            y = sin * (this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) + this.dom.picker.canvas.canvas.bounds.centerY;
        }
        this.x = Math.floor(x - this.dom.picker.canvas.canvas.bounds.left);
        this.y = Math.floor(y - this.dom.picker.canvas.canvas.bounds.top);
    }

    ColorPicker.prototype.initPalettes = function() {
        this.dom.palettes = {};
        this.dom.palettes.list = [];
        this.dom.palettes.container = document.createElement('div');
        addClass(this.dom.palettes.container, 'palletes-container');
        this.dom.container.appendChild(this.dom.palettes.container);
        this.dom.palettes.add = document.createElement('div');
        addClass(this.dom.palettes.add, 'palette add');
        this.dom.palettes.container.appendChild(this.dom.palettes.add);
        var $this = this;
        this.dom.palettes.add.addEventListener('click', function() {
            addClass($this.dom.picker.canvas.container, 'active');
            $this.updateCanvasBounds();
            palette = $this.addPalette($this.RGBtoHEX($this.rgb[0], $this.rgb[1], $this.rgb[2]));
            for (var i = 0; i < $this.dom.palettes.list.length; i++) {
                removeClass($this.dom.palettes.list[i], 'active');
            }
            addClass(palette, 'active');
            $this.selectedPalette = palette;
        });
        for (var i = 0; i < this.options.palettes.length; i++) {
            this.addPalette(this.options.palettes[i]);
        }
    }

    ColorPicker.prototype.addPalette = function(color) {
        var palette = document.createElement('div');
        palette.style.background = color;
        palette.color = color;
        var $this = this;
        palette.addEventListener('click', function() {
            for (var i = 0; i < $this.dom.palettes.list.length; i++) {
                removeClass($this.dom.palettes.list[i], 'active');
            }
            addClass(this, 'active');
            $this.selectedPalette = this;
            rgb = $this.HEXtoRGB(this.color);
            coordinates = $this.getPositionFromColor(color);
            $this.x = coordinates.x;
            $this.y = coordinates.y;
            $this.updateColor(rgb);
            $this.updateAll();
        });
        addClass(palette, 'palette');
        insertBefore(palette, this.dom.palettes.add);
        this.dom.palettes.list.push(palette);
        return palette;
    }

    ColorPicker.prototype.updateAll = function() {
        this.redrawSlider();
        this.updatePointers();
        this.dom.picker.canvas.input.value = this.hex;
        this.options.onUpdate(this.rgb);
        if (this.selectedPalette) {
            this.selectedPalette.style.background = this.hex;
        }
    }
    ColorPicker.prototype.getPositionFromColor = function(color) {
        color = this.HEXtoRGB(color);
        if (color == null) {
            return null;
        }
        this.hsv = this.RGBtoHSV(color[0], color[1], color[2]);
        return this.getSVGPositionFromHS(this.hsv[0], this.hsv[1]);
    }

    ColorPicker.prototype.updateSliderCursor = function(y) {
        total = y - this.dom.slider.slider.bounds.top - 6;
        total = this.dom.slider.slider.bounds.height - total;
        total = total / this.dom.slider.slider.bounds.height;
        total = total.toFixed(2);
        if (total < 0) {
            total = 0;
        } else if (total > 1) {
            total = 1;
        }
        total = 1 - total;
        this.dom.slider.pointer.style.top = this.dom.slider.slider.bounds.height * total - (this.dom.slider.pointer.bounds.height / 2) + 'px';
        return total;
    }

    ColorPicker.prototype.redrawSlider = function() {
        rgb = this.HSVtoRGB(this.hsv[0], this.hsv[1], 1);
        hex = this.RGBtoHEX(rgb[0], rgb[1], rgb[2]);
        gradient = this.makeGradient(hex, '#000');
        this.dom.slider.slider.setAttribute('style', gradient);
        this.updatePointers();
    };

    ColorPicker.prototype.updatePointers = function() {
        if (this.dom.picker.canvas.pointer.bounds) {
            this.dom.picker.canvas.pointer.style.left = this.x - (this.dom.picker.canvas.pointer.bounds.width / 2) + 'px';
            this.dom.picker.canvas.pointer.style.top = this.y - (this.dom.picker.canvas.pointer.bounds.height / 2) + 'px';
        }
        if (this.dom.slider.slider.bounds) {
            position = this.dom.slider.slider.bounds.height * (1 - this.hsv[2]) - (this.dom.slider.pointer.bounds.height / 2);
            this.dom.slider.pointer.style.top = position + 'px';
        }
    }

    ColorPicker.prototype.updateCanvasBounds = function() {
        this.dom.picker.canvas.canvas.bounds = this.dom.picker.canvas.canvas.getBoundingClientRect();
        this.dom.picker.canvas.pointer.bounds = this.dom.picker.canvas.pointer.getBoundingClientRect();
        this.dom.picker.canvas.canvas.bounds.centerX = this.dom.picker.canvas.canvas.bounds.left + (this.dom.picker.canvas.canvas.bounds.width / 2);
        this.dom.picker.canvas.canvas.bounds.centerY = this.dom.picker.canvas.canvas.bounds.top + (this.dom.picker.canvas.canvas.bounds.height / 2);
        this.dom.picker.canvas.canvas.bounds.radius = this.dom.picker.canvas.canvas.bounds.width / 2;
    }
    // https://codepen.io/benknight/pen/nADpy
    // Get a coordinate pair from hue and saturation components.
    ColorPicker.prototype.getSVGPositionFromHS = function(h, s) {
        var hue = this.scientificToArtisticSmooth(h * 360);
        var theta = hue * (Math.PI / 180);
        var y = Math.sin(theta) * this.dom.picker.canvas.canvas.bounds.radius * s;
        var x = Math.cos(theta) * this.dom.picker.canvas.canvas.bounds.radius * s;
        return {
            x: x + this.dom.picker.canvas.canvas.bounds.radius,
            y: this.dom.picker.canvas.canvas.bounds.radius - y
        }

    };

    //https://codepen.io/benknight/pen/nADpy
    ColorPicker.prototype.scientificToArtisticSmooth = function(hue) {
        return (
            hue < 35 ? hue * (60 / 35) :
                hue < 60 ? this.mapRange(hue, 35, 60, 60, 122) :
                    hue < 120 ? this.mapRange(hue, 60, 120, 122, 165) :
                        hue < 180 ? this.mapRange(hue, 120, 180, 165, 218) :
                            hue < 240 ? this.mapRange(hue, 180, 240, 218, 275) :
                                hue < 300 ? this.mapRange(hue, 240, 300, 275, 330) :
                                    this.mapRange(hue, 300, 360, 330, 360));
    }

    //https://codepen.io/benknight/pen/nADpy
    ColorPicker.prototype.mapRange = function(value, fromLower, fromUpper, toLower, toUpper) {
        return (toLower + (value - fromLower) * ((toUpper - toLower) / (fromUpper - fromLower)));
    }

    //https://gist.github.com/Arahnoid/9923989
    ColorPicker.prototype.HEXtoRGB = function(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : null;
    }

    //http://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
    ColorPicker.prototype.RGBtoHSV = function(r, g, b) {
        r = r / 255, g = g / 255, b = b / 255;
        var max = Math.max(r, g, b),
            min = Math.min(r, g, b);
        var h, s, v = max;

        var d = max - min;
        s = max == 0 ? 0 : d / max;

        if (max == min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }
        return [h, s, v];
    }

    //http://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
    ColorPicker.prototype.HSVtoRGB = function(h, s, v) {
        var r, g, b;
        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0:
                r = v, g = t, b = p;
                break;
            case 1:
                r = q, g = v, b = p;
                break;
            case 2:
                r = p, g = v, b = t;
                break;
            case 3:
                r = p, g = q, b = v;
                break;
            case 4:
                r = t, g = p, b = v;
                break;
            case 5:
                r = v, g = p, b = q;
                break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    //https://gist.github.com/Arahnoid/9923989
    ColorPicker.prototype.RGBtoHEX = function(r, g, b) {
        function componentToHex(c) {
            var hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    //http://jsfiddle.net/barney/D9W4v/
    ColorPicker.prototype.makeGradient = function(colour1, colour2) {
        var gradientString = '\
            /* Mozilla Firefox */ \
            background-image: -moz-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
            /* Opera */ \
            background-image: -o-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
            /* Webkit (Safari/Chrome 10) */ \
            background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, {colour1}), color-stop(1, {colour2}));\
            /* Webkit (Chrome 11+) */ \
            background-image: -webkit-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
            /* IE10+ */\
            background: -ms-linear-gradient(top,  {colour1} 0%,{colour2} 100%);\
            /* W3C */\
            background: linear-gradient(top,  {colour1} 0%,{colour2} 100%);\
        ';

        return gradientString.replace(/\{colour1\}/g, colour1).replace(/\{colour2\}/g, colour2)
    };
}());

var colorPreview = document.getElementById('preview');

var picker = new ColorPicker(document.getElementById('picker'), {
    onUpdate: function(rgb) {
        colorPreview.style.background = "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
    }
});