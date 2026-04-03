import{A as e,C as t,Et as n,I as r,N as i,c as a,d as o,it as s,l as c,s as l,t as u,u as d}from"./_plugin-vue_export-helper-kZ7KRUHX.js";import{D as f,dt as p,v as m}from"./timescircle-tNVQPCD5.js";var h=f.extend({name:`tag`,style:`
    .p-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: dt('tag.primary.background');
        color: dt('tag.primary.color');
        font-size: dt('tag.font.size');
        font-weight: dt('tag.font.weight');
        padding: dt('tag.padding');
        border-radius: dt('tag.border.radius');
        gap: dt('tag.gap');
    }

    .p-tag-icon {
        font-size: dt('tag.icon.size');
        width: dt('tag.icon.size');
        height: dt('tag.icon.size');
    }

    .p-tag-rounded {
        border-radius: dt('tag.rounded.border.radius');
    }

    .p-tag-success {
        background: dt('tag.success.background');
        color: dt('tag.success.color');
    }

    .p-tag-info {
        background: dt('tag.info.background');
        color: dt('tag.info.color');
    }

    .p-tag-warn {
        background: dt('tag.warn.background');
        color: dt('tag.warn.color');
    }

    .p-tag-danger {
        background: dt('tag.danger.background');
        color: dt('tag.danger.color');
    }

    .p-tag-secondary {
        background: dt('tag.secondary.background');
        color: dt('tag.secondary.color');
    }

    .p-tag-contrast {
        background: dt('tag.contrast.background');
        color: dt('tag.contrast.color');
    }
`,classes:{root:function(e){var t=e.props;return[`p-tag p-component`,{"p-tag-info":t.severity===`info`,"p-tag-success":t.severity===`success`,"p-tag-warn":t.severity===`warn`,"p-tag-danger":t.severity===`danger`,"p-tag-secondary":t.severity===`secondary`,"p-tag-contrast":t.severity===`contrast`,"p-tag-rounded":t.rounded}]},icon:`p-tag-icon`,label:`p-tag-label`}}),g={name:`BaseTag`,extends:m,props:{value:null,severity:null,rounded:Boolean,icon:String},style:h,provide:function(){return{$pcTag:this,$parentInstance:this}}};function _(e){"@babel/helpers - typeof";return _=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},_(e)}function v(e,t,n){return(t=y(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function y(e){var t=b(e,`string`);return _(t)==`symbol`?t:t+``}function b(e,t){if(_(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t);if(_(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}var x={name:`Tag`,extends:g,inheritAttrs:!1,computed:{dataP:function(){return p(v({rounded:this.rounded},this.severity,this.severity))}}},S=[`data-p`];function C(s,l,u,f,p,m){return e(),o(`span`,t({class:s.cx(`root`),"data-p":m.dataP},s.ptmi(`root`)),[s.$slots.icon?(e(),c(r(s.$slots.icon),t({key:0,class:s.cx(`icon`)},s.ptm(`icon`)),null,16,[`class`])):s.icon?(e(),o(`span`,t({key:1,class:[s.cx(`icon`),s.icon]},s.ptm(`icon`)),null,16)):d(``,!0),s.value!=null||s.$slots.default?i(s.$slots,`default`,{key:2},function(){return[a(`span`,t({class:s.cx(`label`)},s.ptm(`label`)),n(s.value),17)]}):d(``,!0)],16,S)}x.render=C;var w=u({__name:`StatusBadge`,props:{status:{type:String,default:``}},setup(t){let n=t,r={accepted:{label:`Принято`,severity:`success`},processing:{label:`В работе`,severity:`warn`},draft:{label:`Черновик`,severity:`secondary`},rejected:{label:`Отклонено`,severity:`danger`},active:{label:`Активно`,severity:`success`},inactive:{label:`Неактивен`,severity:`secondary`}},i=l(()=>r[n.status]?.label??n.status),a=l(()=>r[n.status]?.severity??`secondary`);return(t,n)=>(e(),c(s(x),{value:i.value,severity:a.value,rounded:``,class:`status-tag`},null,8,[`value`,`severity`]))}},[[`__scopeId`,`data-v-d71ab832`]]);export{w as t};