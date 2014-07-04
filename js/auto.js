/* global $, window */

var AutoUI = function (params) {
    "use strict";
    params = params || {};
    var maxX = params.width || 300,
        maxY = params.height || 100,
        parent = params.parent || $('body'),
        id = params.id || 'autoUI',
        canvas = $('<canvas>', {
            id: id,
            'Width': maxX,
            'Height': maxY
        }),
        points = [],
        ctx = canvas[0].getContext('2d'),
        selected = -1,
        mouseDown = 0,
        repaint;

    canvas.on('contextmenu', function (e) {
        return false;
    });

    canvas.on('mousedown', function (e) {
        var x = e.offsetX / maxX,
            y = e.offsetY / maxY,
            rectX = (5 / maxX),
            rectY = (5 / maxY),
            addAfter = 0,
            minDragX = 0,
            maxDragX = 0;
        //this.height, this.width

        for (var i = 0; i < points.length; i++) {
            var pX = points[i].x,
                pY = points[i].y;
            if (x > pX - rectX && x < pX + rectX && y > pY - rectY && y < pY + rectY) {
                addAfter = -1;
                selected = i;
                if (i > 0) {
                    if (i < points.length - 1) { // we have adjacent points on both sides
                        maxDragX = points[i + 1].x - 0.01;
                        minDragX = points[i - 1].x + 0.01;
                    } else { // we have adjacent point on the left, but no point on the right
                        maxDragX = 0.99;
                        minDragX = points[i - 1].x + 0.01;
                    }
                } else { // we are the first point
                    minDragX = 0.01;
                    if (points.length === 1) { // we are the only point in the array
                        maxDragX = 0.99;
                    } else { // we are the first point and have adjacent point on the right
                        maxDragX = points[i + 1].x - 0.01;
                    }
                }
                break;
            } else if (x > points[i].x) {
                addAfter = i + 1;
            }
        }
        if (addAfter >= 0) {
            selected = addAfter;
            points.splice(addAfter, 0, {
                x: x,
                y: y
            });

        } else if (e.which === 3) {
            points.splice(selected, 1);
        }

        mouseDown = {
            addAfter: addAfter,
            x: x,
            y: y,
            minDragX: minDragX,
            maxDragX: maxDragX
        };
        repaint();
    });

    canvas.on('mousemove', function (e) {
        var x = e.offsetX / maxX,
            y = e.offsetY / maxY;
        if (mouseDown && mouseDown.addAfter === -1) {
            if ((x !== mouseDown.x || y !== mouseDown.y) && mouseDown.minDragX && mouseDown.maxDragX) {
                x = x > mouseDown.maxDragX ? mouseDown.maxDragX : (x < mouseDown.minDragX ? mouseDown.minDragX : x); // take care of max and min values
                points[selected] = {
                    x: x,
                    y: y
                };
            }
            repaint();
        }
    });

    canvas.on('mouseup', function (e) {
        mouseDown = 0;
    });

    repaint = function () {
        var x = 0,
            y = 0;
        ctx.clearRect(0, 0, maxX, maxY);

        ctx.beginPath();
        ctx.lineWidth = 0.5;

        for (var n = 0; n < 1; n += 0.1) {
            ctx.moveTo(0, n * maxY);
            ctx.lineTo(maxX, n * maxY);
        }
        ctx.strokeStyle = '#999';
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 1;

        points[0] ? ctx.moveTo(0, points[0].y * maxY) : ctx.moveTo(0, maxY / 2); // do we have starting point?
        for (var i = 0; i < points.length; i++) {
            x = points[i].x * maxX;
            y = points[i].y * maxY;
            ctx.lineTo(x, y);
            if (i === selected) {
                ctx.fillStyle = '#FF0000';
            } else {
                ctx.fillStyle = '#000000';
            }
            ctx.fillRect(x - 4, y - 4, 8, 8);
            ctx.moveTo(x, y);
        }
        points[points.length - 1] ? ctx.lineTo(maxX, points[points.length - 1].y * maxY) : ctx.lineTo(maxX, maxY / 2); // do we have ending point?
        ctx.strokeStyle = '#000';
        ctx.stroke();
    };

    this.points = points;
    this.canvas = canvas;
    this.refresh = repaint;

    canvas.appendTo(parent);
    repaint();
};
