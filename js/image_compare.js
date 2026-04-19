// ==========================================================================
// Eses Image Compare
// ==========================================================================
// 
// Description:
// The 'Eses Image Compare' node provides a versatile tool for comparing
// two images directly within the ComfyUI interface. It features a draggable
// slider for interactive side-by-side comparison and various blend modes
// for visual analysis of differences.
// 
// Key Features:
// 
// - Interactive Image Comparison:
//   - A draggable slider allows for real-time comparison of two input images.
//   - Supports a "normal" comparison mode where the slider reveals parts of Image A
//     over Image B.
//   - Includes multiple blend modes (difference, lighten, darken, screen, multiply)
//     for advanced visual analysis of image variations.
// 
// - Live Preview:
//   - The node displays a live preview of the connected images, updating as
//     the slider is moved or the blend mode is changed.
// 
// - Difference Mask Output:
//   - Generates a grayscale mask highlighting the differences between Image A and Image B,
//     useful for further processing or analysis in the workflow.
// 
// - Quality of Life Features:
//   - Automatic resizing of the node to match the aspect ratio of the input images.
//   - "Reset Node Size" button to re-trigger the auto-sizing and reset the slider position.
//   - State serialization: Slider position and blend mode are saved with the workflow.
// 
// Version: 1.5.0
// 
// License: See LICENSE.txt
// 
// ==========================================================================


import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
    name: "Eses.EsesImageCompare",

    nodeCreated(node) {
        if (node.comfyClass === "EsesImageCompare") {
            
            // Variables -----------

            const PADDING = 10;
            const HEADER_HEIGHT = 100;
            const MIN_HEIGHT = 300;
            const NEUTRALPOS = 0.5;
            const BOTTOM_PADDING = 4;
            const RESOLUTION_TEXT_HEIGHT = 14;
            const RESOLUTION_TEXT_TOP_OFFSET = 5;

            const DEFAULT_COMPARE_AXIS = "horizontal";
            const CONTROL_ROW_PADDING = 14;
            const CONTROL_ROW_GAP = 8;
            const CONTROL_ROW_HEIGHT = 20;
            const HANDLE_SCALE = 0.6;

            const blendModes = ["normal", "difference", "lighten", "darken", "screen", "multiply"];
            const compareAxes = ["horizontal", "vertical"];

            const normalizeCompareAxis = (value) => compareAxes.includes(value) ? value : DEFAULT_COMPARE_AXIS;
            const getAxisControlLabel = () => normalizeCompareAxis(node.properties.compare_axis) === "vertical" ? "Axis: Vertical" : "Axis: Horizontal";
            
            const getWidgetThemeColors = () => {
                const lg = (typeof LiteGraph !== "undefined") ? LiteGraph : null;
                return {
                    bg: lg?.WIDGET_BGCOLOR || "#2b2b2b",
                    outline: lg?.WIDGET_OUTLINE_COLOR || "#666",
                    text: lg?.WIDGET_TEXT_COLOR || lg?.NODE_TEXT_COLOR || "#DDD"
                };
            };

            const setCompareAxis = (value) => {
                node.properties.compare_axis = normalizeCompareAxis(value);
                node.setDirtyCanvas(true, true);
            };

            node.imageA = null;
            node.imageB = null;
            node.isDragging = false;
            node.isManuallyResized = false;
            node.slider_pos = NEUTRALPOS;
            node.setSize([320, 440]);
            node.properties = node.properties || {};
            node.properties.compare_axis = normalizeCompareAxis(node.properties.compare_axis);

            node.addWidget("combo", "Blend Mode", "normal", function (value) {
                    node.properties.blend_mode = value;
                    node.setDirtyCanvas(true, true);
                }, { 
                    values: blendModes, property: "blend_mode" 
                }
            );

            const resetNodeSize = () => {
                node.isManuallyResized = false;
                node.slider_pos = NEUTRALPOS;

                if (node.imageA) {
                    autosize(node.imageA);
                }
                node.setDirtyCanvas(true, true);
            };

            const toggleCompareAxis = () => {
                const currentAxis = normalizeCompareAxis(node.properties.compare_axis);
                const nextAxis = currentAxis === "horizontal" ? "vertical" : "horizontal";
                setCompareAxis(nextAxis);
            };

            const getControlRowRects = (widget) => {
                const rowY = (widget.last_y ?? 0);
                const rowWidth = Math.max(40, node.size[0] - CONTROL_ROW_PADDING * 2);
                const buttonWidth = (rowWidth - CONTROL_ROW_GAP) / 2;
                return {
                    reset: {
                        x: CONTROL_ROW_PADDING,
                        y: rowY,
                        w: buttonWidth,
                        h: CONTROL_ROW_HEIGHT
                    },
                    axis: {
                        x: CONTROL_ROW_PADDING + buttonWidth + CONTROL_ROW_GAP,
                        y: rowY,
                        w: buttonWidth,
                        h: CONTROL_ROW_HEIGHT
                    }
                };
            };

            const controlRowWidget = node.addWidget("custom", "compare_controls", "", () => { }, {});
            controlRowWidget.computeSize = () => [0, CONTROL_ROW_HEIGHT];

            controlRowWidget.draw = function (ctx) {
                const rects = getControlRowRects(this);
                const themeColors = getWidgetThemeColors();
                const drawButton = (rect, label) => {
                    ctx.save();
                    ctx.fillStyle = themeColors.bg;
                    ctx.strokeStyle = themeColors.outline;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    drawRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 3);
                    ctx.fill();
                    ctx.stroke();

                    ctx.font = "11px Arial";
                    ctx.fillStyle = themeColors.text;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, rect.x + (rect.w / 2), rect.y + (rect.h / 2));
                    ctx.restore();
                };

                drawButton(rects.reset, "Reset Node Size");
                drawButton(rects.axis, getAxisControlLabel());
            };

            controlRowWidget.mouse = function (event, pos) {
                const eventType = event?.type;
                const isMouseDownEvent = eventType === "mousedown" || eventType === "pointerdown";
                if (eventType && !isMouseDownEvent) {
                    return false;
                }

                if (event?.button !== undefined && event.button !== 0) {
                    return false;
                }

                const rects = getControlRowRects(this);
                const isInsideRect = (p, rect) => p[0] >= rect.x && p[0] <= rect.x + rect.w && p[1] >= rect.y && p[1] <= rect.y + rect.h;

                if (isInsideRect(pos, rects.reset)) {
                    resetNodeSize();
                    return true;
                }

                if (isInsideRect(pos, rects.axis)) {
                    toggleCompareAxis();
                    return true;
                }

                return false;
            };

            const autosize = (img) => {
                if (!node.isManuallyResized && img) {
                    const aspectRatio = img.naturalWidth / img.naturalHeight;
                    const baseWidth = 300;
                    node.size[0] = baseWidth;
                    const drawAreaHeight = (baseWidth - PADDING * 2) / aspectRatio;

                    let newHeight = drawAreaHeight + HEADER_HEIGHT + BOTTOM_PADDING + RESOLUTION_TEXT_HEIGHT;

                    if (newHeight < MIN_HEIGHT) {
                        newHeight = MIN_HEIGHT;
                    }

                    node.size[1] = newHeight;
                    node.setDirtyCanvas(true, true);
                }
            };

            node.autosize = autosize;
            const originalConfigure = node.configure;

            node.configure = function (data) {
                originalConfigure.apply(this, arguments);

                if (data.properties) {
                    if (data.properties.blend_mode !== undefined) {
                        this.properties.blend_mode = data.properties.blend_mode;
                    }
                    if (data.properties.compare_axis !== undefined) {
                        this.properties.compare_axis = normalizeCompareAxis(data.properties.compare_axis);
                    }
                }

                if (data.isManuallyResized) this.isManuallyResized = data.isManuallyResized;
                if (data.slider_pos !== undefined) {
                    this.slider_pos = data.slider_pos;
                }
                if (data.compare_axis !== undefined) {
                    this.properties.compare_axis = normalizeCompareAxis(data.compare_axis);
                }

                setCompareAxis(this.properties.compare_axis);
            };

            const originalSerialize = node.serialize;

            node.serialize = function () {
                const data = originalSerialize.call(this);
                data.isManuallyResized = this.isManuallyResized;
                data.slider_pos = this.slider_pos;
                data.compare_axis = normalizeCompareAxis(this.properties.compare_axis);
                return data;
            };

            node.onResize = function () {
                this.isManuallyResized = true;

                if (this.size[1] < MIN_HEIGHT) {
                    this.size[1] = MIN_HEIGHT;
                }
            };

            
            // Helper function to draw the text 
            // label with its new background
            const drawLabelWithBackground = (ctx, text, x, y, textAlign) => {
                const textMetrics = ctx.measureText(text);
                const boxPadding = 2;
                const fontSize = 8;
                const boxHeight = fontSize + (boxPadding * 2);
                const boxWidth = textMetrics.width + (boxPadding * 2);
                const boxRadius = 1.5;

                let boxX;

                if (textAlign === "left") {
                    boxX = x - boxPadding;
                }
                else {
                    boxX = x - textMetrics.width - boxPadding;
                }

                // Adjust boxY to account for the textBaseline change
                // NOTE, 0.3 modifies the pos slightly
                const boxY = y - (fontSize / 2) - boxPadding - 0.3;

                // Draw rounded rect background
                ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
                ctx.beginPath();
                ctx.moveTo(boxX + boxRadius, boxY);
                ctx.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxHeight, boxRadius);
                ctx.arcTo(boxX + boxWidth, boxY + boxHeight, boxX, boxY + boxHeight, boxRadius);
                ctx.arcTo(boxX, boxY + boxHeight, boxX, boxY, boxRadius);
                ctx.arcTo(boxX, boxY, boxX + boxWidth, boxY, boxRadius);
                ctx.closePath();
                ctx.fill();

                // Draw text
                ctx.fillStyle = "white";
                ctx.textAlign = textAlign;
                ctx.textBaseline = "middle";
                ctx.fillText(text, x, y);
            }

            const drawRoundedRectPath = (ctx, x, y, width, height, radius) => {
                const r = Math.max(0, Math.min(radius, width / 2, height / 2));
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + width, y, x + width, y + height, r);
                ctx.arcTo(x + width, y + height, x, y + height, r);
                ctx.arcTo(x, y + height, x, y, r);
                ctx.arcTo(x, y, x + width, y, r);
                ctx.closePath();
            };

            Object.assign(node, {
                getContainerArea() {
                    const area = {
                        x: PADDING,
                        y: HEADER_HEIGHT,
                        width: this.size[0] - PADDING * 2,
                        height: this.size[1] - HEADER_HEIGHT - BOTTOM_PADDING - RESOLUTION_TEXT_HEIGHT
                    };

                    if (area.height < 0)
                        area.height = 0;

                    return (area.width < 1 || area.height < 1) ? null : area;
                },

                getImageRenderData(img, container) {
                    const imgRatio = img.naturalWidth / img.naturalHeight;
                    const containerRatio = container.width / container.height;

                    let renderWidth, renderHeight, renderX, renderY;

                    if (imgRatio > containerRatio) {
                        renderWidth = container.width;
                        renderHeight = container.width / imgRatio;
                    }
                    else {
                        renderHeight = container.height;
                        renderWidth = container.height * imgRatio;
                    }

                    renderX = container.x + (container.width - renderWidth) / 2;
                    renderY = container.y + (container.height - renderHeight) / 2;

                    return { x: renderX, y: renderY, width: renderWidth, height: renderHeight };
                },

                getCompareAxis() {
                    return (this.properties && this.properties.compare_axis === "vertical") ? "vertical" : "horizontal";
                },

                onDrawForeground(ctx) {
                    if (this.flags.collapsed)
                        return;

                    ctx.save();
                    const containerArea = this.getContainerArea();

                    if (!containerArea) {
                        ctx.restore();
                        return;
                    }

                    if (this.imageA) {
                        const renderData = this.getImageRenderData(this.imageA, containerArea);

                        if (!this.imageB) {
                            ctx.drawImage(this.imageA, renderData.x, renderData.y, renderData.width, renderData.height);
                            // Draw Resolution Text (Single Image)
                            if (this.imageA && this.imageA_res) {
                                ctx.font = "10px Arial";
                                ctx.fillStyle = "#dfdfdf";
                                ctx.textAlign = "center";
                                ctx.textBaseline = "top";

                                const textX = containerArea.x + (containerArea.width / 2);
                                const textY = renderData.y + renderData.height + RESOLUTION_TEXT_TOP_OFFSET;
                                ctx.fillText(this.imageA_res, textX, textY);
                            }
                            ctx.restore();
                            return;
                        }

                        const sliderValue = this.slider_pos;
                        const compareAxis = this.getCompareAxis();
                        const isVerticalCompare = compareAxis === "vertical";
                        const sliderPx = isVerticalCompare
                            ? renderData.y + sliderValue * renderData.height
                            : renderData.x + sliderValue * renderData.width;
                        const blendMode = this.properties.blend_mode || "normal";

                        const setTextStyle = () => {
                            //ctx.font = "8px Arial";
                            ctx.font = "100 8px Arial";

                            // Disabled shadows
                            // ctx.shadowColor = 'rgba(0, 0, 0, 255)';
                            // ctx.shadowOffsetX = 0;
                            // ctx.shadowOffsetY = 0;
                            // ctx.shadowBlur = 6;
                            ctx.textBaseline = "top";
                        };


                        // Main Drawing Logic ---

                        if (blendMode !== "normal" && this.imageB) {
                            let compositeOp = "source-over";

                            if (blendMode === "difference")
                                compositeOp = "difference";
                            else if (blendMode === "lighten")
                                compositeOp = "lighter";
                            else if (blendMode === "multiply")
                                compositeOp = "multiply";
                            else if (blendMode === "darken")
                                compositeOp = "darken";
                            else if (blendMode === "screen")
                                compositeOp = "screen";

                            ctx.drawImage(this.imageB, renderData.x, renderData.y, renderData.width, renderData.height);
                            ctx.globalCompositeOperation = compositeOp;
                            ctx.drawImage(this.imageA, renderData.x, renderData.y, renderData.width, renderData.height);
                            ctx.globalCompositeOperation = 'source-over';

                            ctx.save();
                            ctx.beginPath();
                            if (isVerticalCompare) {
                                const bottomMaskHeight = (renderData.y + renderData.height) - sliderPx;
                                ctx.rect(renderData.x, sliderPx, renderData.width, bottomMaskHeight);
                            }
                            else {
                                ctx.rect(sliderPx, renderData.y, renderData.width * (1.0 - sliderValue), renderData.height);
                            }
                            ctx.clip();
                            ctx.drawImage(this.imageB, renderData.x, renderData.y, renderData.width, renderData.height);
                            ctx.restore();
                        }
                        else {
                            if (this.imageB) {
                                ctx.drawImage(this.imageB, renderData.x, renderData.y, renderData.width, renderData.height);
                            }
                            else {
                                ctx.fillStyle = "black";
                                ctx.fillRect(renderData.x, renderData.y, renderData.width, renderData.height);
                            }

                            ctx.save();
                            ctx.beginPath();
                            if (isVerticalCompare) {
                                ctx.rect(renderData.x, renderData.y, renderData.width, sliderPx - renderData.y);
                            }
                            else {
                                ctx.rect(renderData.x, renderData.y, sliderPx - renderData.x, renderData.height);
                            }
                            ctx.clip();
                            ctx.drawImage(this.imageA, renderData.x, renderData.y, renderData.width, renderData.height);
                            ctx.restore();
                        }

                        // Text & UI Drawing ---
                        setTextStyle();

                        // Image A label
                        ctx.save();
                        ctx.beginPath();
                        if (isVerticalCompare) {
                            ctx.rect(renderData.x, renderData.y, renderData.width, sliderPx - renderData.y);
                        }
                        else {
                            ctx.rect(renderData.x, renderData.y, sliderPx - renderData.x, renderData.height);
                        }
                        ctx.clip();
                        drawLabelWithBackground(ctx, "A", renderData.x + 5, renderData.y + 9, "left");
                        ctx.restore();

                        // Image B label
                        ctx.save();
                        ctx.beginPath();
                        if (isVerticalCompare) {
                            const bottomMaskHeight = (renderData.y + renderData.height) - sliderPx;
                            ctx.rect(renderData.x, sliderPx, renderData.width, bottomMaskHeight);
                        }
                        else {
                            const rightMaskStart = sliderPx;
                            const rightMaskWidth = (renderData.x + renderData.width) - sliderPx;
                            ctx.rect(rightMaskStart, renderData.y, rightMaskWidth, renderData.height);
                        }
                        ctx.clip();
                        if (isVerticalCompare) {
                            drawLabelWithBackground(ctx, "B", renderData.x + 5, renderData.y + renderData.height - 9, "left");
                        }
                        else {
                            drawLabelWithBackground(ctx, "B", renderData.x + renderData.width - 5, renderData.y + 9, "right");
                        }
                        ctx.restore();

                        const lineColor = "rgba(255, 255, 255, 0.9)";
                        const handleColor = "rgba(255, 255, 255, 0.95)";

                        ctx.save();
                        ctx.globalCompositeOperation = "difference";
                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = lineColor;
                        ctx.lineCap = "butt";
                        ctx.lineWidth = 0.5;
                        // Keep the divider fully on the B side so it samples only one image.
                        const dividerCenterPx = sliderPx + (ctx.lineWidth / 2);
                        ctx.beginPath();
                        if (isVerticalCompare) {
                            ctx.moveTo(renderData.x, dividerCenterPx);
                            ctx.lineTo(renderData.x + renderData.width, dividerCenterPx);
                        }
                        else {
                            ctx.moveTo(dividerCenterPx, renderData.y);
                            ctx.lineTo(dividerCenterPx, renderData.y + renderData.height);
                        }
                        ctx.stroke();
                        ctx.restore();

                        // Draw rounded slider handle and clip it to the image area so
                        // the handle is naturally masked at the image edges.
                        const baseHandleLong = Math.min(34, Math.max(18, Math.min(renderData.width, renderData.height) * 0.24));
                        const baseHandleShort = 10;
                        const handleLong = baseHandleLong * HANDLE_SCALE * 1.2;
                        const handleShort = baseHandleShort * HANDLE_SCALE * 0.8;
                        const handleWidth = isVerticalCompare ? handleLong : handleShort;
                        const handleHeight = isVerticalCompare ? handleShort : handleLong;
                        const handleRadius = 3.5;
                        const handleX = isVerticalCompare
                            ? renderData.x + ((renderData.width - handleWidth) / 2)
                            : sliderPx - (handleWidth / 2);
                        const handleY = isVerticalCompare
                            ? sliderPx - (handleHeight / 2)
                            : renderData.y + ((renderData.height - handleHeight) / 2);

                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(renderData.x, renderData.y, renderData.width, renderData.height);
                        ctx.clip();

                        ctx.fillStyle = handleColor;
                        ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        drawRoundedRectPath(ctx, handleX, handleY, handleWidth, handleHeight, handleRadius);
                        ctx.fill();
                        ctx.stroke();
                        ctx.restore();

                    }
                    else {
                        ctx.font = "11px Arial";
                        ctx.fillStyle = "#CCCCCC";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        let text = "Connect Image A and B for blend modes";

                        if (!this.imageA)
                            text = "Connect Images and run workflow";

                        ctx.fillText(text, containerArea.x + containerArea.width / 2, containerArea.y + containerArea.height / 2);
                    }

                    // Draw Resolution Text
                    if (this.imageA && this.imageA_res) {
                        const renderData = this.getImageRenderData(this.imageA, containerArea);
                        ctx.font = "10px Arial";
                        ctx.fillStyle = "#dfdfdf";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "top";

                        let resText = this.imageA_res;
                        if (this.imageB && this.imageB_res) {
                            resText += " : " + this.imageB_res;
                        }

                        const textX = containerArea.x + (containerArea.width / 2);
                        const textY = renderData.y + renderData.height + RESOLUTION_TEXT_TOP_OFFSET;
                        ctx.fillText(resText, textX, textY);
                    }

                    ctx.restore();
                },

                updateSliderFromEvent(event) {

                    if (!this.imageA) return;

                    const renderData = this.getImageRenderData(this.imageA, this.getContainerArea());
                    const localPos = app.canvas.convertEventToCanvasOffset(event);
                    const compareAxis = this.getCompareAxis();
                    let newSliderValue;

                    if (compareAxis === "vertical") {
                        const mouseY = localPos[1] - this.pos[1];
                        newSliderValue = (mouseY - renderData.y) / renderData.height;
                    }
                    else {
                        const mouseX = localPos[0] - this.pos[0];
                        newSliderValue = (mouseX - renderData.x) / renderData.width;
                    }

                    this.slider_pos = Math.max(0.0, Math.min(1.0, newSliderValue));
                    this.setDirtyCanvas(true, true);
                },

                onMouseDown(event) {

                    if (event.button !== 0 || !this.imageA || !this.imageB) return false;

                    const renderData = this.getImageRenderData(this.imageA, this.getContainerArea());
                    const localPos = app.canvas.convertEventToCanvasOffset(event);
                    const mouseX = localPos[0] - this.pos[0];
                    const mouseY = localPos[1] - this.pos[1];

                    if (mouseX >= renderData.x && mouseX <= renderData.x + renderData.width &&
                        mouseY >= renderData.y && mouseY <= renderData.y + renderData.height) {
                        this.isDragging = true;
                        this.updateSliderFromEvent(event);

                        return true;
                    }
                    return false;
                },

                onMouseMove(event) {
                    if (this.isDragging && event.buttons === 1 && this.imageA) {
                        this.updateSliderFromEvent(event);
                    }
                },

                onMouseUp(event) {
                    if (event.button === 0 && this.isDragging) {
                        this.isDragging = false;
                    }
                },
            });


            // CONTEXT MENU --------

            const originalGetExtraMenuOptions = node.getExtraMenuOptions;

            node.getExtraMenuOptions = function (canvas, options) {
                if (originalGetExtraMenuOptions) {
                    originalGetExtraMenuOptions.apply(this, arguments);
                }

                // "Save Workflow" option, always available
                options.unshift({
                    content: "Save Workflow (.json)",
                    
                    callback: () => {
                        const workflowJson = JSON.stringify(app.graph.serialize(), null, 2);
                        const blob = new Blob([workflowJson], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        const timestamp = new Date().getTime();
                        link.download = `workflow_${timestamp}.json`;
                        link.href = url;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }
                });


                // Image-related menu options
                const containerArea = this.getContainerArea();
                
                if (!this.imageA || !containerArea) {
                    return;
                }

                const renderData = this.getImageRenderData(this.imageA, containerArea);
                const mouse_pos = canvas.graph_mouse;

                const isOverImage = mouse_pos[0] >= this.pos[0] + renderData.x &&
                    mouse_pos[0] <= this.pos[0] + renderData.x + renderData.width &&
                    mouse_pos[1] >= this.pos[1] + renderData.y &&
                    mouse_pos[1] <= this.pos[1] + renderData.y + renderData.height;

                if (isOverImage) {
                    const compareAxis = this.getCompareAxis();
                    const sliderAbs = compareAxis === "vertical"
                        ? this.pos[1] + renderData.y + (this.slider_pos * renderData.height)
                        : this.pos[0] + renderData.x + (this.slider_pos * renderData.width);
                    
                    let imageToOpen = null;
                    let imageLabel = '';

                    const isInARegion = compareAxis === "vertical"
                        ? mouse_pos[1] < sliderAbs
                        : mouse_pos[0] < sliderAbs;

                    if (isInARegion) {
                        imageToOpen = this.imageA;
                        imageLabel = 'A';
                    }
                    else if (this.imageB) {
                        imageToOpen = this.imageB;
                        imageLabel = 'B';
                    }

                    if (imageToOpen) {
                        const timestamp = new Date().getTime();
                        const filename = `image_compare_${imageLabel}_${timestamp}.png`;

                        // "Open Image" menu item
                        options.unshift({
                            content: "Open Image",

                            callback: () => {
                                const newTab = window.open("", "_blank");

                                if (newTab) {
                                    newTab.document.title = filename;

                                    const htmlContent = `
                                        <body style="margin:0; background-color:#222; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:15px; font-family:sans-serif;">
                                            <img src="${imageToOpen.src}" style="max-width:90%; max-height:85vh; object-fit:contain; box-shadow:0 0 15px rgba(0,0,0,0.5);">
                                            <div style="color:#ddd; background-color:#3c3c3c; padding:8px 12px; border-radius:5px; font-family:monospace; user-select:all;">
                                                ${filename}
                                            </div>
                                        </body>
                                    `;

                                    newTab.document.write(htmlContent);
                                    newTab.document.close();
                                }
                                else {
                                    alert("Pop-up was blocked. Please allow pop-ups for this site.");
                                }
                            }
                        });

                        // "Save Image" menu item
                        options.unshift({
                            content: "Save Image",

                            callback: () => {
                                const link = document.createElement('a');
                                link.download = filename;
                                link.href = imageToOpen.src;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }
                        });
                        
                    }
                }
            };
        }
    },

});



// Listeners -----------

api.addEventListener("eses.image_compare_preview", ({ detail }) => {
    const node = app.graph.getNodeById(detail.node_id);
    if (!node) return;

    let assetsToLoad = (detail.image_a_data ? 1 : 0) + (detail.image_b_data ? 1 : 0);
    if (assetsToLoad === 0) {
        node.imageA = null;
        node.imageB = null;
        node.setDirtyCanvas(true, true);
        return;
    }

    let loadedCount = 0;

    const onAssetLoaded = () => {
        loadedCount++;
        if (loadedCount === assetsToLoad) {
            if (node.imageA && typeof node.autosize === 'function') {
                node.autosize(node.imageA);
            }
            node.setDirtyCanvas(true, true);
        }
    };

    node.imageA = detail.image_a_data ? Object.assign(new Image(), { src: `data:image/png;base64,${detail.image_a_data}`, onload: onAssetLoaded }) : null;
    node.imageB = detail.image_b_data ? Object.assign(new Image(), { src: `data:image/png;base64,${detail.image_b_data}`, onload: onAssetLoaded }) : null;
    node.imageA_res = detail.image_a_res;
    node.imageB_res = detail.image_b_res;

});
