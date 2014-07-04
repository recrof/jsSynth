// the function extends from -functionExtent to functionExtent

// data about our discrete samples
var FFT = (function() {
    "use strict";

    var FFT = function() {
        initialize.apply(this, arguments);
    }, $this = FFT.prototype;

    var FFT_PARAMS = {
        get: function(n) {
            return FFT_PARAMS[n] || (function() {
                var bitrev = (function() {
                    var x, i, j, k, n2;
                    x = new Int16Array(n);
                    n2 = n >> 1;
                    i = j = 0;
                    for (;;) {
                        x[i] = j;
                        if (++i >= n) break;
                        k = n2;
                        while (k <= j) { j -= k; k >>= 1; }
                        j += k;
                    }
                    return x;
                }());
                var i, k = Math.floor(Math.log(n) / Math.LN2);
                var sintable = new Float32Array((1<<k)-1);
                var costable = new Float32Array((1<<k)-1);
                var PI2 = Math.PI * 2;

                for (i = sintable.length; i--; ) {
                    sintable[i] = Math.sin(PI2 * (i / n));
                    costable[i] = Math.cos(PI2 * (i / n));
                }
                return FFT_PARAMS[n] = {
                    bitrev: bitrev, sintable:sintable, costable:costable
                };
            }());
        }
    };

    var initialize = function(n) {
        n = (typeof n === "number") ? n : 512;
        n = 1 << Math.ceil(Math.log(n) * Math.LOG2E);

        this.length = n;
        this.buffer = new Float32Array(n);
        this.real   = new Float32Array(n);
        this.imag   = new Float32Array(n);
        this._real  = new Float32Array(n);
        this._imag  = new Float32Array(n);

        var params = FFT_PARAMS.get(n);
        this._bitrev   = params.bitrev;
        this._sintable = params.sintable;
        this._costable = params.costable;
    };

    $this.forward = function(_buffer) {
        var buffer, real, imag, bitrev, sintable, costable;
        var i, j, n, k, k2, h, d, c, s, ik, dx, dy;

        buffer = this.buffer;
        real   = this.real;
        imag   = this.imag;
        bitrev = this._bitrev;
        sintable = this._sintable;
        costable = this._costable;
        n = buffer.length;

        for (i = n; i--; ) {
            buffer[i] = _buffer[i];
            real[i]   = _buffer[bitrev[i]];
            imag[i]   = 0.0;
        }

        for (k = 1; k < n; k = k2) {
            h = 0; k2 = k + k; d = n / k2;
            for (j = 0; j < k; j++) {
                c = costable[h];
                s = sintable[h];
                for (i = j; i < n; i += k2) {
                    ik = i + k;
                    dx = s * imag[ik] + c * real[ik];
                    dy = c * imag[ik] - s * real[ik];
                    real[ik] = real[i] - dx; real[i] += dx;
                    imag[ik] = imag[i] - dy; imag[i] += dy;
                }
                h += d;
            }
        }
        real = real.subarray(0,real.length / 2);
        imag = imag.subarray(0,imag.length / 2);
        return {real:real, imag:imag};
    };

    $this.inverse = function(_real, _imag) {
        var buffer, real, imag, bitrev, sintable, costable;
        var i, j, n, k, k2, h, d, c, s, ik, dx, dy, t;

        buffer = this.buffer;
        real   = this._real;
        imag   = this._imag;
        bitrev = this._bitrev;
        sintable = this._sintable;
        costable = this._costable;
        n = buffer.length;

        for (i = n; i--; ) {
            j = bitrev[i];
            real[i] = +_real[j];
            imag[i] = -_imag[j];
        }

        for (k = 1; k < n; k = k2) {
            h = 0; k2 = k + k; d = n / k2;
            for (j = 0; j < k; j++) {
                c = costable[h];
                s = sintable[h];
                for (i = j; i < n; i += k2) {
                    ik = i + k;
                    dx = s * imag[ik] + c * real[ik];
                    dy = c * imag[ik] - s * real[ik];
                    real[ik] = real[i] - dx; real[i] += dx;
                    imag[ik] = imag[i] - dy; imag[i] += dy;
                }
                h += d;
            }
        }

        for (i = n; i--; ) {
            buffer[i] = real[i] / n;
        }
        return buffer;
    };

    return FFT;
}());

$(function() {
    var val = [],
        fourier = [],
        fft = {},
        MaxX = 1000,
        MaxY = 200,
        canvas0 = $('<canvas>', {id: 'canvas0', 'Width': MaxX, 'Height': MaxY, 'style': 'border: 1px solid silver'}),
        canvas1 = $('<canvas>', {id: 'canvas1', 'Width': MaxX, 'Height': MaxY, 'style': 'border: 1px solid silver'}),
        canvas2 = $('<canvas>', {id: 'canvas2', 'Width': MaxX, 'Height': MaxY, 'style': 'border: 1px solid silver'}),
        presetText = $('<textarea>', {id: 'real_text', rows: '30', cols: '500'}),
        runButton = $('<button>', {id: 'run', html: 'run'}),
        functionText = $('<input>', {id: 'func_text', value: '1 - 2 * x', style: 'width: 1000px;'}),

        ctx0 = canvas0[0].getContext('2d'),
        ctx1 = canvas1[0].getContext('2d'),
        ctx2 = canvas2[0].getContext('2d'),

        size = 512;


    $('body')
    .append(canvas2)
    .append(canvas0)
    .append(canvas1)
    .append(functionText)
    .append(runButton)
    .append(presetText);
    functionText.keyup(function(event){
        if(event.keyCode == 13){
            runButton.click();
        }
    });

    runButton.on('click', function() {
        for(var i = 0; i < size; i++) {
            var x = i/size;
            val[i] = eval(functionText.val());
            //val[i] = 1 - (i*2 / size);
        }

        fft = new FFT(val.length);
        fourier = fft.forward(val);
        ctx0.clearRect(0,0,MaxX,MaxY);
        ctx1.clearRect(0,0,MaxX,MaxY);
        ctx2.clearRect(0,0,MaxX,MaxY);
        ctx2.font = ctx0.font = ctx1.font = "16px Courier";
        ctx2.fillText("time", 0, 16);
        ctx0.fillText("real", 0, 16);
        ctx1.fillText("imag", 0, 16);
        //ctx.fillStyle = '#000';
        var target0 = fourier.real;
        var target1 = fourier.imag
        for(var i = 0; i < target0.length; i++) {
            seg = i / target0.length;
            ctx0.fillRect(seg * MaxX, (MaxY/2), 1, -target0[i]);
            ctx1.fillRect(seg * MaxX, (MaxY/2), 1, -target1[i]);
            ctx2.fillRect(seg * MaxX, (MaxY/2), 1, -val[i*2]*90);
        }
        presetText.html('jsSynthWaveTable.ff_test = \n\n    {\n        real: [' + Array.prototype.join.call(fourier.real,',')+'],\n'
                    + '        imag: [' + Array.prototype.join.call(fourier.imag,',')+']\n    }\n\n; s.initWaveTable();');
    });
});
