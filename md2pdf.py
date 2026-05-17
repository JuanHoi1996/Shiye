import os
import sys
import asyncio
from markdown_it import MarkdownIt
from mdit_py_plugins.front_matter import front_matter_plugin
from mdit_py_plugins.footnote import footnote_plugin
from playwright.async_api import async_playwright

async def md_to_pdf(input_path, output_path):
    # 1. 读取 Markdown 内容
    with open(input_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # 2. 转换为 HTML
    # 使用 markdown-it-py 以获得更好的扩展支持
    md = (
        MarkdownIt("gfm-like", {"linkify": False})
        .use(front_matter_plugin)
        .use(footnote_plugin)
        .enable("table")
    )
    
    # 简单的 HTML 模板，包含一些基础样式和 MathJax 支持（如果需要渲染公式）
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                line-height: 1.6;
                color: #24292e;
                max-width: 800px;
                margin: 0 auto;
                padding: 45px;
            }}
            h1, h2, h3 {{ margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }}
            h1 {{ padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }}
            h2 {{ padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }}
            blockquote {{
                padding: 0 1em;
                color: #6a737d;
                border-left: 0.25em solid #dfe2e1;
                margin: 0 0 16px 0;
            }}
            table {{
                border-spacing: 0;
                border-collapse: collapse;
                width: 100%;
                margin-bottom: 16px;
            }}
            table th, table td {{
                padding: 6px 13px;
                border: 1px solid #dfe2e5;
            }}
            table tr {{ background-color: #fff; border-top: 1px solid #c6cbd1; }}
            table tr:nth-child(2n) {{ background-color: #f6f8fa; }}
            code {{
                padding: 0.2em 0.4em;
                margin: 0;
                font-size: 85%;
                background-color: rgba(27,31,35,0.05);
                border-radius: 3px;
            }}
            pre {{
                padding: 16px;
                overflow: auto;
                font-size: 85%;
                line-height: 1.45;
                background-color: #f6f8fa;
                border-radius: 3px;
            }}
            pre code {{ background-color: transparent; padding: 0; }}
            hr {{ height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; }}
        </style>
        <!-- MathJax for LaTeX support -->
        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    </head>
    <body>
        {md.render(md_content)}
    </body>
    </html>
    """

    # 3. 使用 Playwright 转换为 PDF
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html_content)
        
        # 等待 MathJax 渲染完成（如果存在公式）
        await page.wait_for_timeout(2000) 
        
        await page.pdf(path=output_path, format="A4", margin={
            "top": "20mm",
            "bottom": "20mm",
            "left": "20mm",
            "right": "20mm"
        })
        await browser.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python md2pdf.py <input_file> [output_file]")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.md', '.pdf')
    
    asyncio.run(md_to_pdf(input_file, output_file))
    print(f"Successfully converted {input_file} to {output_file}")
