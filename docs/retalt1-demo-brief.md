---
marp: true
size: 16:9
paginate: false
style: |
  section {
    background: #050b16;
    color: #eef7ff;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    padding: 42px 56px 34px;
  }
  h1 {
    color: #ffffff;
    font-size: 38px;
    letter-spacing: -0.02em;
    margin: 0 0 4px;
  }
  h2 {
    color: #42d9ff;
    font-size: 21px;
    font-weight: 600;
    margin: 0 0 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1.08fr 0.92fr;
    gap: 18px;
    align-items: stretch;
  }
  .stack {
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 12px;
  }
  .figure {
    background: #ffffff;
    border: 1px solid #1f6793;
    border-radius: 10px;
    box-shadow: 0 0 24px rgba(25, 164, 230, 0.12);
    overflow: hidden;
  }
  .figure img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .takeaway {
    border-left: 4px solid #f4a340;
    background: rgba(244, 163, 64, 0.09);
    margin-top: 15px;
    padding: 10px 15px;
    font-size: 19px;
  }
  .facts {
    color: #d8e8f6;
    font-size: 17px;
    margin-top: 12px;
  }
  .facts strong {
    color: #5de2ff;
  }
  .source {
    color: #7f9bb3;
    font-size: 10px;
    margin-top: 9px;
  }
  .data-grid {
    display: grid;
    grid-template-columns: 0.92fr 1.08fr;
    gap: 18px;
    height: 445px;
  }
  .split {
    display: grid;
    grid-template-columns: 1.3fr 0.7fr 0.9fr;
    gap: 8px;
    margin-top: 13px;
  }
  .split > div {
    border: 1px solid #235b7e;
    border-radius: 8px;
    background: #08182a;
    padding: 8px 10px;
    font-size: 14px;
  }
  .split strong {
    color: #5de2ff;
    display: block;
    font-size: 16px;
  }
---

<!-- Render with Marp HTML enabled because the slide layout uses HTML grid containers. -->

# RETALT1 demo problem
## Predict the aerodynamic loads of a control-surface configuration the model has never seen

<div class="grid">
  <div class="figure">
    <img src="../static/retalt1-pdf-extracts/reference-models-and-coefficients-p6.png" alt="RETALT1 wind-tunnel models and aerodynamic force and moment reference frame">
  </div>
  <div class="stack">
    <div class="figure">
      <img src="../static/retalt1-pdf-extracts/planar-fin-configurations-p7.png" alt="RETALT1 planar-fin control configurations">
    </div>
    <div class="figure">
      <img src="../static/retalt1-pdf-extracts/petal-configurations-p9.png" alt="RETALT1 petal control configurations">
    </div>
  </div>
</div>

<div class="facts">
  <strong>Inputs:</strong> Mach, angle of attack, surface family and layout, and four surface deflections.
  <strong>Outputs:</strong> three force coefficients and five moment coefficients.
</div>

<div class="takeaway">
  The benchmark asks for generalization across <strong>entire unseen control-surface configurations</strong> - not a CFD field and not a nearby-row interpolation.
</div>

<div class="source">
  Source figures: RETALT1 DLR/CFSE AEDB2.0 Description (2022-08-26), pp. 6, 7 and 9. CC BY 4.0.
</div>

---

# The data is 170 polars - not 6,908 independent rows
## Adjacent angle-of-attack samples belong to the same processed aerodynamic curve

<div class="data-grid">
  <div class="figure">
    <img src="../static/retalt1-pdf-extracts/data-extraction-conditions-p10.png" alt="Official RETALT1 data extraction conditions">
  </div>
  <div class="figure">
    <img src="../static/retalt1-pdf-extracts/representative-polars-p14.png" alt="Representative RETALT1 coefficient polars over angle of attack">
  </div>
</div>

<div class="split">
  <div><strong>Train</strong>4,408 rows - 109 curves</div>
  <div><strong>Visible validation</strong>779 rows - 19 complete Mach 2.5 curves</div>
  <div><strong>Sealed evaluation</strong>1,721 rows - 42 curves - 7 unseen configurations</div>
</div>

<div class="takeaway">
  Never random-split neighboring α rows. Hold out <strong>whole Mach curves</strong> and test on <strong>whole configurations</strong>.
</div>

<div class="source">
  Source figures: RETALT1 DLR/CFSE AEDB2.0 Description (2022-08-26), pp. 10 and 14. Split counts: data/retalt1/manifest.json.
</div>
