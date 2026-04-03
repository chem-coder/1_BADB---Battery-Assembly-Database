import{A as e,C as t,Ct as n,Et as r,I as i,N as a,P as o,U as s,W as c,c as l,d as u,g as d,l as f,u as p}from"./_plugin-vue_export-helper-kZ7KRUHX.js";import{D as m,Dt as h,Pt as g,dt as _,i as v,r as y,v as b}from"./timescircle-tNVQPCD5.js";import{n as x,r as S}from"./PageHeader-1v12P_Bc.js";var C=m.extend({name:`panel`,style:`
    .p-panel {
        display: block;
        border: 1px solid dt('panel.border.color');
        border-radius: dt('panel.border.radius');
        background: dt('panel.background');
        color: dt('panel.color');
    }

    .p-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: dt('panel.header.padding');
        background: dt('panel.header.background');
        color: dt('panel.header.color');
        border-style: solid;
        border-width: dt('panel.header.border.width');
        border-color: dt('panel.header.border.color');
        border-radius: dt('panel.header.border.radius');
    }

    .p-panel-toggleable .p-panel-header {
        padding: dt('panel.toggleable.header.padding');
    }

    .p-panel-title {
        line-height: 1;
        font-weight: dt('panel.title.font.weight');
    }

    .p-panel-content-container {
        display: grid;
        grid-template-rows: 1fr;
    }

    .p-panel-content-wrapper {
        min-height: 0;
    }

    .p-panel-content {
        padding: dt('panel.content.padding');
    }

    .p-panel-footer {
        padding: dt('panel.footer.padding');
    }
`,classes:{root:function(e){var t=e.props;return[`p-panel p-component`,{"p-panel-toggleable":t.toggleable}]},header:`p-panel-header`,title:`p-panel-title`,headerActions:`p-panel-header-actions`,pcToggleButton:`p-panel-toggle-button`,contentContainer:`p-panel-content-container`,contentWrapper:`p-panel-content-wrapper`,content:`p-panel-content`,footer:`p-panel-footer`}}),w={name:`Panel`,extends:{name:`BasePanel`,extends:b,props:{header:String,toggleable:Boolean,collapsed:Boolean,toggleButtonProps:{type:Object,default:function(){return{severity:`secondary`,text:!0,rounded:!0}}}},style:C,provide:function(){return{$pcPanel:this,$parentInstance:this}}},inheritAttrs:!1,emits:[`update:collapsed`,`toggle`],data:function(){return{d_collapsed:this.collapsed}},watch:{collapsed:function(e){this.d_collapsed=e}},methods:{toggle:function(e){this.d_collapsed=!this.d_collapsed,this.$emit(`update:collapsed`,this.d_collapsed),this.$emit(`toggle`,{originalEvent:e,value:this.d_collapsed})},onKeyDown:function(e){(e.code===`Enter`||e.code===`NumpadEnter`||e.code===`Space`)&&(this.toggle(e),e.preventDefault())}},computed:{buttonAriaLabel:function(){return this.toggleButtonProps&&this.toggleButtonProps.ariaLabel?this.toggleButtonProps.ariaLabel:this.header},dataP:function(){return _({toggleable:this.toggleable})}},components:{PlusIcon:x,MinusIcon:S,Button:y},directives:{ripple:v}},T=[`data-p`],E=[`data-p`],D=[`id`],O=[`id`,`aria-labelledby`];function k(m,_,v,y,b,x){var S=o(`Button`);return e(),u(`div`,t({class:m.cx(`root`),"data-p":x.dataP},m.ptmi(`root`)),[l(`div`,t({class:m.cx(`header`),"data-p":x.dataP},m.ptm(`header`)),[a(m.$slots,`header`,{id:m.$id+`_header`,class:n(m.cx(`title`)),collapsed:b.d_collapsed},function(){return[m.header?(e(),u(`span`,t({key:0,id:m.$id+`_header`,class:m.cx(`title`)},m.ptm(`title`)),r(m.header),17,D)):p(``,!0)]}),l(`div`,t({class:m.cx(`headerActions`)},m.ptm(`headerActions`)),[a(m.$slots,`icons`),m.toggleable?a(m.$slots,`togglebutton`,{key:0,collapsed:b.d_collapsed,toggleCallback:function(e){return x.toggle(e)},keydownCallback:function(e){return x.onKeyDown(e)}},function(){return[d(S,t({id:m.$id+`_header`,class:m.cx(`pcToggleButton`),"aria-label":x.buttonAriaLabel,"aria-controls":m.$id+`_content`,"aria-expanded":!b.d_collapsed,unstyled:m.unstyled,onClick:_[0]||=function(e){return x.toggle(e)},onKeydown:_[1]||=function(e){return x.onKeyDown(e)}},m.toggleButtonProps,{pt:m.ptm(`pcToggleButton`)}),{icon:s(function(n){return[a(m.$slots,m.$slots.toggleicon?`toggleicon`:`togglericon`,{collapsed:b.d_collapsed},function(){return[(e(),f(i(b.d_collapsed?`PlusIcon`:`MinusIcon`),t({class:n.class},m.ptm(`pcToggleButton`).icon),null,16,[`class`]))]})]}),_:3},16,[`id`,`class`,`aria-label`,`aria-controls`,`aria-expanded`,`unstyled`,`pt`])]}):p(``,!0)],16)],16,E),d(h,t({name:`p-collapsible`},m.ptm(`transition`)),{default:s(function(){return[c(l(`div`,t({id:m.$id+`_content`,class:m.cx(`contentContainer`),role:`region`,"aria-labelledby":m.$id+`_header`},m.ptm(`contentContainer`)),[l(`div`,t({class:m.cx(`contentWrapper`)},m.ptm(`contentWrapper`)),[l(`div`,t({class:m.cx(`content`)},m.ptm(`content`)),[a(m.$slots,`default`)],16),m.$slots.footer?(e(),u(`div`,t({key:0,class:m.cx(`footer`)},m.ptm(`footer`)),[a(m.$slots,`footer`)],16)):p(``,!0)],16)],16,O),[[g,!b.d_collapsed]])]}),_:3},16)],16,T)}w.render=k;export{w as t};