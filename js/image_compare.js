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
// Version: 1.2.2
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
            const PADDING = 10;
            const HEADER_HEIGHT = 100;
            const MIN_HEIGHT = 300;
            const NEUTRALPOS = 0.5;

            node.imageA = null;
            node.imageB = null;
            node.isDragging = false;
            node.isManuallyResized = false;
            node.slider_pos = NEUTRALPOS;
            node.setSize([320, 440]);

            const blendModes = ["normal", "difference", "lighten", "darken", "screen", "multiply"];
            
            node.addWidget("combo", "Blend Mode", "normal", function (value) {
                node.properties.blend_mode = value;
                node.setDirtyCanvas(true, true);
            }, { values: blendModes, property: "blend_mode" });


            node.addWidget("button", "Reset Node Size", null, () => {
                node.isManuallyResized = false;
                node.slider_pos = NEUTRALPOS;

                if (node.imageA) {
                    autosize(node.imageA);
                }

                node.setDirtyCanvas(true, true);
            });

            const autosize = (img) => {
                if (!node.isManuallyResized && img) {
                    const aspectRatio = img.naturalWidth / img.naturalHeight;
                    const baseWidth = 300;
                    node.size[0] = baseWidth;
                    const drawAreaHeight = (baseWidth - PADDING * 2) / aspectRatio;

                    let newHeight = drawAreaHeight + HEADER_HEIGHT + PADDING;

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
                }

                if (data.isManuallyResized) this.isManuallyResized = data.isManuallyResized;
                if (data.slider_pos !== undefined) {
                    this.slider_pos = data.slider_pos;
                }
            };

            const originalSerialize = node.serialize;

            node.serialize = function () {
                const data = originalSerialize.call(this);
                data.isManuallyResized = this.isManuallyResized;
                data.slider_pos = this.slider_pos;
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
                ctx.textBaseline = "middle"; // Change textBaseline to middle
                ctx.fillText(text, x, y);
            }

            Object.assign(node, {
                getContainerArea() {
                    const area = {
                        x: PADDING,
                        y: HEADER_HEIGHT,
                        width: this.size[0] - PADDING * 2,
                        height: this.size[1] - HEADER_HEIGHT - PADDING
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
                            ctx.restore();
                            return;
                        }

                        const sliderValue = this.slider_pos;
                        const sliderPx = renderData.x + sliderValue * renderData.width;
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
                            ctx.rect(sliderPx, renderData.y, renderData.width * (1.0 - sliderValue), renderData.height);
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
                            ctx.rect(renderData.x, renderData.y, sliderPx - renderData.x, renderData.height);
                            ctx.clip();
                            ctx.drawImage(this.imageA, renderData.x, renderData.y, renderData.width, renderData.height);
                            ctx.restore();
                        }

                        // Text & UI Drawing ---
                        setTextStyle();

                        // Image A label
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(renderData.x, renderData.y, sliderPx - renderData.x, renderData.height);
                        ctx.clip();
                        drawLabelWithBackground(ctx, "A", renderData.x + 5, renderData.y + 9, "left");
                        ctx.restore();

                        // Image B label
                        ctx.save();
                        ctx.beginPath();
                        const rightMaskStart = sliderPx;
                        const rightMaskWidth = (renderData.x + renderData.width) - sliderPx;
                        ctx.rect(rightMaskStart, renderData.y, rightMaskWidth, renderData.height);
                        ctx.clip();
                        drawLabelWithBackground(ctx, "B", renderData.x + renderData.width - 5, renderData.y + 9, "right");
                        ctx.restore();

                        const lineColor = "rgba(255, 255, 255, 0.3)";
                        const handleColor = "rgba(255, 255, 255, 1.0)";

                        ctx.strokeStyle = lineColor;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(sliderPx, renderData.y);
                        ctx.lineTo(sliderPx, renderData.y + renderData.height);
                        ctx.stroke();

                        ctx.fillStyle = handleColor;
                        const handleY = renderData.y + renderData.height / 2;
                        const triangleSize = 3.5;
                        const triangleGap = 2.5;
                        const smallValue = 0.001;

                        // Left-pointing triangle 
                        // (hide if at the left edge)
                        if (this.slider_pos > smallValue) {
                            ctx.beginPath();
                            ctx.moveTo(sliderPx - triangleGap, handleY - triangleSize);
                            ctx.lineTo(sliderPx - triangleGap, handleY + triangleSize);
                            ctx.lineTo(sliderPx - triangleGap - triangleSize, handleY);
                            ctx.closePath();
                            ctx.fill();
                        }

                        // Right-pointing triangle 
                        // (hide if at the right edge)
                        if (this.slider_pos < 1.0 - smallValue) {
                            ctx.beginPath();
                            ctx.moveTo(sliderPx + triangleGap, handleY - triangleSize);
                            ctx.lineTo(sliderPx + triangleGap, handleY + triangleSize);
                            ctx.lineTo(sliderPx + triangleGap + triangleSize, handleY);
                            ctx.closePath();
                            ctx.fill();
                        }

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

                    ctx.restore();
                },

                updateSliderFromEvent(event) {
                    
                    if (!this.imageA) return;

                    const renderData = this.getImageRenderData(this.imageA, this.getContainerArea());
                    const localPos = app.canvas.convertEventToCanvasOffset(event);
                    const mouseX = localPos[0] - this.pos[0];
                    let newSliderValue = (mouseX - renderData.x) / renderData.width;
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
            
            
            // --- CONTEXT MENU LOGIC ---
            const originalGetExtraMenuOptions = node.getExtraMenuOptions;
            
            node.getExtraMenuOptions = function(canvas, options) {
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
                    const sliderAbsX = this.pos[0] + renderData.x + (this.slider_pos * renderData.width);
                    let imageToOpen = null;
                    let imageLabel = '';

                    if (mouse_pos[0] < sliderAbsX) {
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
});