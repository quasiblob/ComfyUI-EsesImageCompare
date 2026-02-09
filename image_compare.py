# ==========================================================================
# Eses Image Compare
# ==========================================================================
#
# Description:
# The 'Eses Image Compare' node provides a versatile tool for comparing
# two images directly within the ComfyUI interface. It features a draggable
# slider for interactive side-by-side comparison and various blend modes
# for visual analysis of differences.
#
# Key Features:
#
# - Interactive Image Comparison:
#   - A draggable slider allows for real-time comparison of two input images.
#   - Supports a "normal" comparison mode where the slider reveals parts of Image A
#     over Image B.
#   - Includes multiple blend modes (difference, lighten, darken, screen, multiply)
#     for advanced visual analysis of image variations.
#
# - Live Preview:
#   - The node displays a live preview of the connected images, updating as
#     the slider is moved or the blend mode is changed.
#
# - Difference Mask Output:
#   - Generates a grayscale mask highlighting the differences between Image A and Image B,
#     useful for further processing or analysis in the workflow.
#
# - Quality of Life Features:
#   - Automatic resizing of the node to match the aspect ratio of the input images.
#   - "Reset Node Size" button to re-trigger the auto-sizing and reset the slider position.
#   - State serialization: Slider position and blend mode are saved with the workflow.
#
# Version: 1.3.0
#
# License: See LICENSE.txt
#
# ==========================================================================


import torch
import numpy as np
from PIL import Image
from server import PromptServer # type: ignore
from io import BytesIO
import base64

# Main class --------------

class EsesImageCompare:
    """
    A custom node to compare two images with a 
    draggable slider and selectable blend modes.
    This node includes an optional passthrough 
    for image_a and a difference mask output.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        blend_modes = ["normal", "difference", "lighten", "darken", "screen", "multiply"]
        return {
            "required": {
                "image_a": ("IMAGE",),
            },
            "optional": {
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT", 
                "extra_pnginfo": "EXTRA_PNGINFO", 
                "unique_id": "UNIQUE_ID",
                "blend_mode": (blend_modes, {"default": "normal"})
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK",)
    RETURN_NAMES = ("image_a", "diff_mask",)
    FUNCTION = "execute"
    OUTPUT_NODE = True 
    CATEGORY = "Eses Nodes/Image Utilities"

    def execute(self, image_a, image_b=None, prompt=None, extra_pnginfo=None, unique_id=None, blend_mode="normal"):
        if unique_id:
            img_a_b64, img_b_b64 = None, None

            if image_a is not None:
                img_a_pil = Image.fromarray(np.clip(255. * image_a[0].cpu().numpy(), 0, 255).astype(np.uint8))
                buffered_a = BytesIO()
                img_a_pil.save(buffered_a, format="PNG")
                img_a_b64 = base64.b64encode(buffered_a.getvalue()).decode("utf-8")

            if image_b is not None:
                img_b_pil = Image.fromarray(np.clip(255. * image_b[0].cpu().numpy(), 0, 255).astype(np.uint8))
                buffered_b = BytesIO()
                img_b_pil.save(buffered_b, format="PNG")
                img_b_b64 = base64.b64encode(buffered_b.getvalue()).decode("utf-8")

            PromptServer.instance.send_sync("eses.image_compare_preview", {
                "node_id": unique_id,
                "image_a_data": img_a_b64,
                "image_b_data": img_b_b64,
                "image_a_res": f"{image_a.shape[2]} \u00d7 {image_a.shape[1]}" if image_a is not None else None,
                "image_b_res": f"{image_b.shape[2]} \u00d7 {image_b.shape[1]}" if image_b is not None else None,
            })
        
        diff_mask = torch.zeros_like(image_a[:, :, :, 0])

        if image_b is not None and image_a.shape == image_b.shape:
            grayscale_a = 0.2126 * image_a[..., 0] + 0.7152 * image_a[..., 1] + 0.0722 * image_a[..., 2]
            grayscale_b = 0.2126 * image_b[..., 0] + 0.7152 * image_b[..., 1] + 0.0722 * image_b[..., 2]
            diff_mask = torch.abs(grayscale_a - grayscale_b)

        return (image_a, diff_mask,)